import { json, bad, setting, currentYear, moderate, rlKey, hit, checkCode, codeLocked } from '../../lib/util.js';

const score = (v) => (v === null || v === undefined || v === '' ? null : Math.max(1, Math.min(5, Math.round(Number(v)))) || null);
const clean = (t) => (t ? String(t).trim().slice(0, 2000) : null) || null;

export async function onRequestPost({ request, env }) {
  if ((await setting(env, 'form_open', '1')) !== '1') return bad('Feedback is closed right now.', 403);
  let body; try { body = await request.json(); } catch { return bad('Bad request'); }
  if (body.website) return json({ ok: true }); // honeypot: bots fill hidden field
  const { centre, batch } = body;
  if (await codeLocked(request, env)) return bad('Too many wrong codes. Please try again in an hour.', 429);
  const access = await checkCode(request, env, body.code);
  if (access.gated && access.centre !== centre) return bad('Your centre code is missing or has changed. Please ask your centre for the current code.', 403);
  const year = await currentYear(env);
  const b = await env.DB.prepare('SELECT 1 FROM batches WHERE centre=? AND batch=? AND active=1').bind(centre, batch).first();
  if (!b) return bad('Please choose your centre and batch again.');

  // Only accept people actually assigned to this batch
  const { results: asg } = await env.DB.prepare(
    "SELECT role,subject,person FROM assignments WHERE centre=? AND (batch=? OR (role='staff' AND batch='All'))"
  ).bind(centre, batch).all();
  const allowed = new Map();
  for (const a of asg) {
    const k = a.role + '|' + a.person;
    if (!allowed.has(k)) allowed.set(k, []);
    if (a.subject) allowed.get(k).push(a.subject);
  }
  const o = body.overall || {};
  const ratings = [];
  for (const r of Array.isArray(body.ratings) ? body.ratings : []) {
    const k = r.role + '|' + r.person;
    if (!allowed.has(k) || ratings.some((x) => x.k === k)) continue;
    const vals = (r.r || []).slice(0, 5).map(score);
    while (vals.length < 5) vals.push(null);
    const comment = clean(r.comment);
    if (vals.every((v) => v === null) && !comment) continue;
    ratings.push({ k, role: r.role, person: r.person, subjects: allowed.get(k).join(', ') || null, vals, comment });
  }
  const overall = { q1: score(o.q1), q2: score(o.q2), q3: score(o.q3), comment: clean(o.comment) };
  if (!ratings.length && overall.q1 === null && overall.q2 === null && overall.q3 === null && !overall.comment)
    return bad('Please answer at least one question.');

  // Moderation: all comments in one go
  const texts = [overall.comment, ...ratings.map((r) => r.comment)];
  const mod = await moderate(env, texts);
  const blocked = mod.map((m, i) => (m.ok ? null : { index: i - 1, person: i ? ratings[i - 1].person : null, reason: m.reason })).filter(Boolean);
  if (blocked.length) return json({ ok: false, blocked }, 422);

  // Generous per-network cap: mobile networks put many people behind one IP address
  if (!(await hit(env, await rlKey(request, env, 'sub', 'hour'), parseInt(env.MAX_SUBMISSIONS_PER_HOUR || '40', 10))))
    return bad('Too many submissions from this network in the last hour. Please try again a little later.', 429);

  const ts = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 19).replace('T', ' '); // IST
  // 0 visible · 3 visible but tagged "check" for admin · 2 waiting for AI (only if AI moderation is on)
  const hid = (i) => (!texts[i] ? 0 : mod[i].pending ? 2 : mod[i].flag ? 3 : 0);
  const s = await env.DB.prepare(
    'INSERT INTO submissions(year,ts,centre,batch,q1,q2,q3,comment,hidden) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id'
  ).bind(year, ts, centre, batch, overall.q1, overall.q2, overall.q3, overall.comment, hid(0)).first();
  if (ratings.length) {
    const st = env.DB.prepare('INSERT INTO ratings(sid,year,centre,batch,role,person,subjects,r1,r2,r3,r4,r5,comment,hidden) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    await env.DB.batch(ratings.map((r, i) => st.bind(s.id, year, centre, batch, r.role, r.person, r.subjects, ...r.vals, r.comment, hid(i + 1))));
  }
  return json({ ok: true, ref: s.id });
}
