// Shared helpers for MYT Pulse API
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

export const bad = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);

export async function setting(env, key, fallback = null) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
  return r ? r.value : fallback;
}
export const currentYear = async (env) => parseInt(await setting(env, 'year', '2026'), 10);

const enc = new TextEncoder();
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
const secretOf = (env) => env.SESSION_SECRET || ('s:' + (env.ADMIN_PASSWORD || ''));
export async function signToken(env, payload, hours = 12) {
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600e3 }));
  return body + '.' + (await hmac(secretOf(env), body));
}
export async function verifyToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if ((await hmac(secretOf(env), body)) !== sig) return null;
  try { const p = JSON.parse(atob(body)); return p.exp > Date.now() ? p : null; } catch { return null; }
}
export async function requireAdmin(request, env) {
  const t = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const p = await verifyToken(env, t);
  return p && p.role === 'admin';
}
export function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !a.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Daily one-way hashed key for rate limiting. Never stored with responses.
export async function rlKey(request, env, scope, period = 'day') {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const d = new Date().toISOString();
  const bucket = period === 'hour' ? d.slice(0, 13) : d.slice(0, 10);
  return scope + ':' + bucket + ':' + (await hmac(secretOf(env) + 'rl', ip)).slice(0, 16);
}
export async function hit(env, key, limit) {
  // housekeeping: forget keys from previous days
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM ratelimit WHERE substr(k, instr(k, ':') + 1, 10) < date('now')").run();
  const r = await env.DB.prepare('INSERT INTO ratelimit(k,n) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET n=n+1 RETURNING n').bind(key).first();
  return r.n <= limit;
}

// ---------- Moderation ----------
// Fast first pass: obvious profanity in English / Hindi / Marathi (Roman + Devanagari).
const BAD = ['fuck','fuk','fck','shit','bitch','bastard','asshole','dickhead','slut','whore','motherfucker',
  'chutiya','chutiye','chutia','chootiya','madarchod','maderchod','mc','bhenchod','behenchod','bhenchodd','bhosdi','bhosdike','bhosdk',
  'gaand','gandu','lavda','lavde','lauda','laude','lund','randi','harami','haramkhor','kamina','kamine','kutta','kutti',
  'zhavadya','zavadya','zhavnya','bhadva','bhadwa','bhadve','bhadvya','yedzava','yedzhava','aai zhav','aighala',
  'चूतिया','चुतिया','मादरचोद','बहनचोद','भोसडी','भोसड़ी','गांडू','गांड','रंडी','हरामी','लौडा','लवडा','भडवा','भड़वा','झवाड्या','कमीना','कुत्ता','कुत्ती'];
export function quickFlag(text) {
  if (!text) return null;
  const t = ' ' + String(text).toLowerCase().replace(/(.)\1{2,}/g, '$1$1').replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ') + ' ';
  for (const w of BAD) {
    // Roman words must start a word (so names like "Ashit" don't trip "shit"); Devanagari matches anywhere
    const hit = /^[a-z ]+$/.test(w) ? (w.length <= 3 ? t.includes(' ' + w + ' ') : t.includes(' ' + w)) : t.includes(w);
    if (hit) return 'Contains abusive language';
  }
  return null;
}

const MOD_PROMPT = `You moderate anonymous feedback that students and parents of a Mumbai coaching institute write about their teachers and office staff. Comments can be in English, Hindi, Marathi, or Hinglish/Romanised Hindi/Marathi.

BLOCK a comment only if it contains: abusive or vulgar language or slurs (in any language or spelling, including disguised spellings), sexual content, threats, or personal attacks on someone's appearance, body, caste, religion, gender, family or private life.

ALLOW everything else, including blunt, harsh or negative criticism of teaching, behaviour, punctuality, attitude, fees or service ("Sir teaches too fast and never solves doubts", "Mam is rude on the phone", "worst batch, waste of money"). Criticism is the whole point; do not block it. Also allow short or meaningless comments like "good", "nil", "-".

Reply with JSON only, no prose: {"results":[{"i":<index>,"ok":true|false,"reason":"<if blocked: a short, polite hint in English for the writer, e.g. 'Please remove the abusive word — your criticism is welcome.'>"}]}`;

export async function moderate(env, texts) {
  // texts: array of strings (may include empty). returns [{ok, reason, pending}]
  const res = texts.map((t) => {
    if (!t || !t.trim()) return { ok: true };
    const q = quickFlag(t);
    return q ? { ok: false, reason: 'Please remove the abusive word. Honest criticism is welcome.' } : null;
  });
  const todo = res.map((r, i) => (r ? null : i)).filter((i) => i !== null);
  if (!todo.length) return res;
  if (!env.ANTHROPIC_API_KEY) { todo.forEach((i) => (res[i] = { ok: true })); return res; } // word filter only
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.MODERATION_MODEL || 'claude-haiku-5-5', max_tokens: 600, system: MOD_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(todo.map((i) => ({ i, text: String(texts[i]).slice(0, 1500) }))) }],
      }),
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('api ' + r.status);
    const data = await r.json();
    const txt = (data.content || []).map((c) => c.text || '').join('');
    const parsed = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const byI = new Map(parsed.results.map((x) => [x.i, x]));
    todo.forEach((i) => {
      const x = byI.get(i);
      res[i] = x ? (x.ok ? { ok: true } : { ok: false, reason: x.reason || 'Please rephrase this respectfully.' }) : { ok: true, pending: true };
    });
  } catch (e) {
    todo.forEach((i) => (res[i] = { ok: true, pending: true })); // fail open, but keep hidden until re-checked
  }
  return res;
}

export async function claude(env, system, user, max_tokens = 900) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.SUMMARY_MODEL || env.MODERATION_MODEL || 'claude-haiku-5-5', max_tokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('Claude API error ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const d = await r.json();
  return (d.content || []).map((c) => c.text || '').join('').trim();
}

export function makePin() {
  const a = new Uint32Array(1); crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}
