import { json, currentYear } from '../../lib/util.js';
// GET /api/pulse -> live participation per centre (counts only, nothing identifying)
export async function onRequestGet({ env }) {
  const year = await currentYear(env);
  const { results } = await env.DB.prepare(
    `SELECT b.centre AS name, SUM(COALESCE(b.students,0)) AS students,
       (SELECT COUNT(*) FROM submissions s WHERE s.year=? AND s.centre=b.centre) AS n
     FROM batches b WHERE b.active=1 GROUP BY b.centre`
  ).bind(year).all();
  const total = results.reduce((a, r) => a + (r.n || 0), 0);
  return json({ year, total, centres: results }, 200, { 'cache-control': 'public, max-age=30' });
}
