import { json, bad, setting, currentYear, rlKey, hit, ensureSchema } from '../../lib/util.js';

const MIN_GROUP = 5; // smallest group shown separately, protects anonymity
const QS = {
  teacher: ['Explains clearly', 'Solves doubts', 'Approachable & supportive', 'Subject knowledge', 'Punctual & professional'],
  staff: ['Helpful', 'Goes beyond expectations', 'Clear & timely communication', 'Timely with papers & timetables', 'Resolves issues'],
};
function agg(rows) {
  const s = [0, 0, 0, 0, 0], c = [0, 0, 0, 0, 0], dist = [0, 0, 0, 0, 0];
  for (const r of rows) for (let i = 0; i < 5; i++) { const v = r['r' + (i + 1)]; if (v) { s[i] += v; c[i]++; dist[v - 1]++; } }
  const q = s.map((x, i) => (c[i] ? +(x / c[i]).toFixed(2) : null));
  const valid = q.filter((x) => x !== null);
  return { n: rows.length, q, overall: valid.length ? +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2) : null, dist };
}
function groups(rows, key) {
  const m = new Map();
  for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
  const out = [], small = [];
  for (const [k, v] of m) (v.length >= MIN_GROUP ? out.push({ name: k, ...agg(v) }) : small.push(k));
  return { list: out.sort((a, b) => b.n - a.n), hidden: small.length };
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export async function onRequestPost({ request, env }) {
  const okRate = await hit(env, await rlKey(request, env, 'pin', 'hour'), 12);
  if (!okRate) return bad('Too many attempts. Please wait an hour and try again.', 429);
  let body; try { body = await request.json(); } catch { return bad('Bad request'); }
  const pin = String(body.pin || '').replace(/\D/g, '');
  if (pin.length < 4) return bad('Enter your PIN.');
  const p = await env.DB.prepare('SELECT name,type FROM people WHERE pin=?').bind(pin).first();
  if (!p) return bad('That PIN did not match. Check the SMS and try again.', 401);
  const released = (await setting(env, 'results_released', '0')) === '1';
  const year = await currentYear(env);
  const prev = year - 1;
  if (!released) return json({ name: p.name, released: false });

  await ensureSchema(env);
  const { results: names } = await env.DB.prepare('SELECT raw FROM aliases WHERE canon=?').bind(p.name).all();
  const all = [...new Set([p.name, ...names.map((x) => x.raw)])];
  const ph = all.map(() => '?').join(',');
  const { results: rows } = await env.DB.prepare(
    `SELECT year,role,centre,batch,r1,r2,r3,r4,r5,comment,hidden FROM ratings WHERE person IN (${ph}) AND year IN (?,?) AND sid NOT IN (SELECT id FROM submissions WHERE excluded=1)`
  ).bind(...all, year, prev).all();

  const roles = [];
  for (const role of ['teacher', 'staff']) {
    const cur = rows.filter((r) => r.role === role && r.year === year);
    const old = rows.filter((r) => r.role === role && r.year === prev);
    if (!cur.length && !old.length) continue;
    // Institute average is the same for everyone, so it's worked out at most once every 30 minutes
    const ck = `inst:${year}:${role}`;
    let inst = null;
    const c = await env.DB.prepare('SELECT v,t FROM cache WHERE k=?').bind(ck).first();
    if (c && Date.now() - c.t < 30 * 60e3) inst = JSON.parse(c.v);
    else {
      inst = await env.DB.prepare(
        'SELECT AVG(r1) a1,AVG(r2) a2,AVG(r3) a3,AVG(r4) a4,AVG(r5) a5 FROM ratings WHERE role=? AND year=? AND sid NOT IN (SELECT id FROM submissions WHERE excluded=1)'
      ).bind(role, year).first();
      await env.DB.prepare('INSERT OR REPLACE INTO cache(k,v,t) VALUES(?,?,?)').bind(ck, JSON.stringify(inst), Date.now()).run();
    }
    const summary = await env.DB.prepare('SELECT text FROM summaries WHERE person=? AND role=? AND year=?').bind(p.name, role, year).first();
    roles.push({
      role, labels: QS[role],
      current: agg(cur), previous: old.length ? agg(old) : null,
      institute: [inst.a1, inst.a2, inst.a3, inst.a4, inst.a5].map((x) => (x ? +x.toFixed(2) : null)),
      byCentre: groups(cur, 'centre'), byBatch: groups(cur.map((r) => ({ ...r, cb: r.centre + ' · ' + r.batch })), 'cb'),
      comments: shuffle(cur.filter((r) => r.comment && (r.hidden === 0 || r.hidden === 3) && r.comment.trim().length > 2).map((r) => r.comment)),
      summary: summary ? summary.text : null,
    });
  }
  return json({ name: p.name, released: true, year, prev, minGroup: MIN_GROUP, roles });
}
