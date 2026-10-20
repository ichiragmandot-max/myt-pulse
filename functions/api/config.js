import { json, bad, setting } from '../../lib/util.js';
// GET /api/config            -> centres + batches
// GET /api/config?centre=&batch= -> teachers + staff for that batch
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const open = (await setting(env, 'form_open', '1')) === '1';
  const centre = u.searchParams.get('centre'), batch = u.searchParams.get('batch');
  if (!centre) {
    const { results } = await env.DB.prepare('SELECT centre,batch FROM batches WHERE active=1 ORDER BY rowid').all();
    const centres = [];
    for (const r of results) {
      let c = centres.find((x) => x.name === r.centre);
      if (!c) centres.push((c = { name: r.centre, batches: [] }));
      c.batches.push(r.batch);
    }
    return json({ open, centres });
  }
  const b = await env.DB.prepare('SELECT 1 FROM batches WHERE centre=? AND batch=? AND active=1').bind(centre, batch).first();
  if (!b) return bad('Unknown batch', 404);
  const { results } = await env.DB.prepare(
    "SELECT role,subject,person FROM assignments WHERE centre=? AND (batch=? OR (role='staff' AND batch='All')) ORDER BY rowid"
  ).bind(centre, batch).all();
  return json({ open, assignments: results });
}
