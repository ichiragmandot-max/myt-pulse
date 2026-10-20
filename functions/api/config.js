import { json, bad, setting, checkCode, codeLocked } from '../../lib/util.js';
// GET /api/config?code=            -> centres + batches this code unlocks
// GET /api/config?code=&centre=&batch= -> teachers + staff for that batch
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const open = (await setting(env, 'form_open', '1')) === '1';
  if (await codeLocked(request, env)) return bad('Too many wrong codes. Please try again in an hour.', 429);
  const access = await checkCode(request, env, u.searchParams.get('code'));
  if (access.gated && !access.centre) return json({ open, gated: true, valid: false, centres: [] });
  const centre = u.searchParams.get('centre'), batch = u.searchParams.get('batch');
  if (!centre) {
    const { results } = await env.DB.prepare('SELECT centre,batch FROM batches WHERE active=1 ORDER BY rowid').all();
    const centres = [];
    for (const r of results) {
      if (access.centre !== '*' && r.centre !== access.centre) continue;
      let c = centres.find((x) => x.name === r.centre);
      if (!c) centres.push((c = { name: r.centre, batches: [] }));
      c.batches.push(r.batch);
    }
    return json({ open, gated: access.gated, valid: true, centres });
  }
  if (access.centre !== '*' && access.centre !== centre) return bad('This code is for a different centre.', 403);
  const b = await env.DB.prepare('SELECT 1 FROM batches WHERE centre=? AND batch=? AND active=1').bind(centre, batch).first();
  if (!b) return bad('Unknown batch', 404);
  const { results } = await env.DB.prepare(
    "SELECT role,subject,person FROM assignments WHERE centre=? AND (batch=? OR (role='staff' AND batch='All')) ORDER BY rowid"
  ).bind(centre, batch).all();
  return json({ open, assignments: results });
}
