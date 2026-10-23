import { json, bad, setting, currentYear, requireAdmin, signToken, safeEqual, rlKey, hit, moderate, claude, makePin, getCodes, makeCode, normCode, quickFlag, softFlag } from '../../../lib/util.js';

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const path = (params.path || []).join('/');
  const method = request.method;
  if (path === 'login' && method === 'POST') return login(request, env);
  if (!(await requireAdmin(request, env))) return bad('Please log in again.', 401);
  const body = method === 'POST' ? await request.json().catch(() => ({})) : null;
  switch (path) {
    case 'data': return data(env);
    case 'roster': return roster(env, body);
    case 'settings': return settings(env, body);
    case 'hide': return hide(env, body);
    case 'pins': return pins(env);
    case 'recheck': return recheck(env);
    case 'summarize': return summarize(env, body);
    case 'codes': return codes(env, body);
    case 'delete': return del(env, body);
    default: return bad('Not found', 404);
  }
}

async function login(request, env) {
  if (!(await hit(env, await rlKey(request, env, 'admin', 'hour'), 10))) return bad('Too many attempts. Try again in an hour.', 429);
  const { password } = await request.json().catch(() => ({}));
  if (!env.ADMIN_PASSWORD) return bad('ADMIN_PASSWORD is not set on the server.', 500);
  if (!safeEqual(password, env.ADMIN_PASSWORD)) return bad('Wrong password.', 401);
  return json({ token: await signToken(env, { role: 'admin' }, 12) });
}

// Everything the dashboard needs, in compact arrays. Aggregation happens in the browser.
async function data(env) {
  const year = await currentYear(env);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then((r) => r.results);
  const [subs, rats, aliases, batches, people, sets, sums] = await Promise.all([
    env.DB.prepare('SELECT id,year,ts,centre,batch,q1,q2,q3,comment,hidden FROM submissions WHERE year IN (?,?)').bind(year, year - 1).raw(),
    env.DB.prepare('SELECT id,sid,year,centre,batch,role,person,subjects,r1,r2,r3,r4,r5,comment,hidden FROM ratings WHERE year IN (?,?)').bind(year, year - 1).raw(),
    q('SELECT raw,canon FROM aliases'),
    q('SELECT centre,batch,students,active FROM batches ORDER BY rowid'),
    q('SELECT name,type,phone IS NOT NULL AND phone<>\'\' AS hasPhone FROM people ORDER BY name'),
    q('SELECT key,value FROM settings'),
    q('SELECT person,role,year,text,updated FROM summaries WHERE year=?', year),
  ]);
  const { results: asg } = await env.DB.prepare('SELECT centre,batch,role,subject,person FROM assignments').all();
  return json({
    year, prev: year - 1,
    subCols: ['id', 'year', 'ts', 'centre', 'batch', 'q1', 'q2', 'q3', 'comment', 'hidden'], subs,
    ratCols: ['id', 'sid', 'year', 'centre', 'batch', 'role', 'person', 'subjects', 'r1', 'r2', 'r3', 'r4', 'r5', 'comment', 'hidden'], rats,
    aliases: Object.fromEntries(aliases.map((a) => [a.raw, a.canon])), batches, people, assignments: asg,
    settings: Object.fromEntries(sets.map((s) => [s.key, s.value])), codes: await getCodes(env), summaries: sums,
  });
}

// Replace roster with the uploaded Excel (parsed in the browser)
async function roster(env, b) {
  const batches = b.batches || [], people = b.people || [], teach = b.teachers || [], staff = b.staff || [];
  if (!batches.length || !people.length) return bad('The file has no batches or people.');
  const names = new Set(people.map((p) => p.name));
  const problems = [];
  for (const t of teach) if (!names.has(t.person)) problems.push(`Teachers sheet: "${t.person}" is not on the People sheet`);
  for (const s of staff) if (!names.has(s.person)) problems.push(`Staff sheet: "${s.person}" is not on the People sheet`);
  if (problems.length) return bad('Fix these names first', 400, { problems: [...new Set(problems)].slice(0, 40) });

  const { results: old } = await env.DB.prepare('SELECT name,pin FROM people').all();
  const oldPin = new Map(old.map((o) => [o.name, o.pin]));
  const used = new Set();
  for (const p of people) {
    let pin = (p.pin && String(p.pin).replace(/\D/g, '')) || oldPin.get(p.name) || null;
    if (pin && used.has(pin)) pin = null;
    while (!pin || used.has(pin)) pin = makePin();
    used.add(pin); p.pin = pin;
  }
  const st = [];
  st.push(env.DB.prepare('DELETE FROM batches'), env.DB.prepare('DELETE FROM people'), env.DB.prepare('DELETE FROM assignments'), env.DB.prepare('DELETE FROM aliases'));
  const ib = env.DB.prepare('INSERT OR REPLACE INTO batches(centre,batch,students,active) VALUES(?,?,?,?)');
  for (const x of batches) st.push(ib.bind(x.centre, x.batch, x.students || null, x.active ? 1 : 0));
  const ip = env.DB.prepare('INSERT OR REPLACE INTO people(name,type,phone,pin) VALUES(?,?,?,?)');
  const ia = env.DB.prepare('INSERT OR REPLACE INTO aliases(raw,canon) VALUES(?,?)');
  for (const p of people) {
    st.push(ip.bind(p.name, p.type || null, p.phone || null, p.pin));
    for (const a of new Set([p.name, ...(p.aliases || [])])) if (a) st.push(ia.bind(a, p.name));
  }
  const ias = env.DB.prepare('INSERT INTO assignments(centre,batch,role,subject,person) VALUES(?,?,?,?,?)');
  for (const t of teach) st.push(ias.bind(t.centre, t.batch, 'teacher', t.subject || null, t.person));
  for (const s of staff) st.push(ias.bind(s.centre, s.batch || 'All', 'staff', null, s.person));
  for (let i = 0; i < st.length; i += 400) await env.DB.batch(st.slice(i, i + 400));
  // If centre codes are on, give any new centre its own code so it isn't locked out
  const codes = await getCodes(env);
  if (Object.values(codes).some(Boolean)) {
    let added = 0;
    for (const c of new Set(batches.filter((x) => x.active).map((x) => x.centre))) if (!codes[c]) { codes[c] = makeCode(c); added++; }
    if (added) await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind('codes', JSON.stringify(codes)).run();
  }
  return json({ ok: true, counts: { batches: batches.length, people: people.length, teachers: teach.length, staff: staff.length } });
}

async function settings(env, b) {
  const allowed = ['form_open', 'results_released', 'year'];
  if (!allowed.includes(b.key)) return bad('Unknown setting');
  await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(b.key, String(b.value)).run();
  return json({ ok: true });
}

async function hide(env, b) {
  const table = b.kind === 'sub' ? 'submissions' : 'ratings';
  await env.DB.prepare(`UPDATE ${table} SET hidden=? WHERE id=?`).bind(b.hidden ? 1 : 0, b.id).run();
  return json({ ok: true });
}

async function pins(env) {
  const { results } = await env.DB.prepare('SELECT name,type,phone,pin FROM people ORDER BY name').all();
  return json({ people: results });
}

// Offline word check for comments stuck as "waiting for AI": clear abuse -> hidden, possible insult -> visible + "check", else visible
async function recheck(env) {
  const out = { checked: 0, hidden: 0, flagged: 0 };
  for (const table of ['submissions', 'ratings']) {
    const { results } = await env.DB.prepare(`SELECT id,comment FROM ${table} WHERE hidden=2`).all();
    const st = env.DB.prepare(`UPDATE ${table} SET hidden=? WHERE id=?`);
    const upd = results.map((r) => { const h = quickFlag(r.comment) ? 1 : softFlag(r.comment) ? 3 : 0; out.checked++; if (h === 1) out.hidden++; if (h === 3) out.flagged++; return st.bind(h, r.id); });
    for (let i = 0; i < upd.length; i += 400) await env.DB.batch(upd.slice(i, i + 400));
  }
  return json({ ...out, remaining: 0 });
}

const SUM_SYS = `You turn anonymous student and parent feedback about one teacher or staff member at a coaching institute into a short, kind, practical note for that person. Comments may be in English, Hindi, Marathi or Hinglish; always write in simple English.

Format exactly:
**What students value**
- 2–3 bullets
**What to work on**
- 1–3 bullets, each a concrete, doable suggestion
**One thing to try this month**
- 1 bullet

Rules: base everything only on the comments and scores given; never quote a comment word-for-word if it could identify a student; ignore meaningless comments ("good", "nil"); never mention other teachers by name; no greeting, no sign-off; under 120 words.`;

async function summarize(env, b) {
  if (!env.ANTHROPIC_API_KEY) return bad('Add ANTHROPIC_API_KEY on the server to use AI summaries.', 400);
  const year = await currentYear(env);
  const { results: names } = await env.DB.prepare('SELECT raw FROM aliases WHERE canon=?').bind(b.person).all();
  const all = [...new Set([b.person, ...names.map((x) => x.raw)])];
  const ph = all.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`SELECT r1,r2,r3,r4,r5,comment FROM ratings WHERE person IN (${ph}) AND role=? AND year=? AND hidden IN (0,3)`).bind(...all, b.role, year).all();
  const comments = results.map((r) => r.comment).filter((c) => c && c.trim().length > 3);
  if (comments.length < 3) return json({ ok: false, reason: 'Fewer than 3 useful comments' });
  const avg = [1, 2, 3, 4, 5].map((i) => { const v = results.map((r) => r['r' + i]).filter(Boolean); return v.length ? (v.reduce((a, c) => a + c, 0) / v.length).toFixed(2) : '-'; });
  const labels = b.role === 'teacher' ? ['Clarity', 'Doubt solving', 'Approachability', 'Knowledge', 'Punctuality'] : ['Helpfulness', 'Going beyond', 'Communication', 'Timeliness', 'Resolving issues'];
  const user = `Role: ${b.role}. Responses: ${results.length}. Average scores out of 5: ${labels.map((l, i) => l + ' ' + avg[i]).join(', ')}.\n\nComments:\n` + comments.slice(0, 250).map((c) => '- ' + c.replace(/\s+/g, ' ').slice(0, 400)).join('\n');
  const text = await claude(env, SUM_SYS, user, 500);
  await env.DB.prepare('INSERT OR REPLACE INTO summaries(person,role,year,text,updated) VALUES(?,?,?,?,datetime(\'now\'))').bind(b.person, b.role, year, text).run();
  return json({ ok: true, text });
}

// Centre access codes. action: 'generate' (all centres), 'regen' (one centre), 'set' (custom), 'off' (remove all)
async function codes(env, b) {
  let c = await getCodes(env);
  const { results } = await env.DB.prepare('SELECT DISTINCT centre FROM batches WHERE active=1').all();
  const centres = results.map((r) => r.centre);
  if (b.action === 'generate') { c = {}; for (const x of centres) c[x] = makeCode(x); }
  else if (b.action === 'regen' && b.centre) c[b.centre] = makeCode(b.centre);
  else if (b.action === 'set' && b.centre) {
    const v = normCode(b.code);
    if (v.length < 4) return bad('Use at least 4 letters or numbers.');
    if (Object.entries(c).some(([k, x]) => k !== b.centre && normCode(x) === v)) return bad('Another centre already uses that code.');
    c[b.centre] = v;
  } else if (b.action === 'off') c = {};
  else return bad('Unknown action');
  await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind('codes', JSON.stringify(c)).run();
  return json({ ok: true, codes: c });
}

// Permanently delete one submission and all its ratings (for removing test entries)
async function del(env, b) {
  const id = parseInt(b.id, 10);
  if (!id) return bad('Missing id');
  const year = await currentYear(env);
  const sub = await env.DB.prepare('SELECT year FROM submissions WHERE id=?').bind(id).first();
  if (!sub) return bad('Not found', 404);
  if (sub.year !== year) return bad('Only this year\'s responses can be deleted.');
  await env.DB.batch([env.DB.prepare('DELETE FROM ratings WHERE sid=?').bind(id), env.DB.prepare('DELETE FROM submissions WHERE id=?').bind(id)]);
  return json({ ok: true });
}
