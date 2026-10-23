import { bad } from '../../lib/util.js';
// Participation counts are no longer shown publicly (only on the admin dashboard).
export async function onRequestGet() {
  return bad('Not available', 404);
}
