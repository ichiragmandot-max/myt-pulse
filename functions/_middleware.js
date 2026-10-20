// Make link-preview image URLs absolute (WhatsApp needs a full https:// URL)
export async function onRequest({ request, next }) {
  const res = await next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const origin = new URL(request.url).origin;
  return new HTMLRewriter()
    .on('meta[property="og:image"]', { element(e) { const c = e.getAttribute('content') || ''; if (c.startsWith('/')) e.setAttribute('content', origin + c); } })
    .on('head', { element(e) { e.append(`<meta property="og:url" content="${origin}/">`, { html: true }); } })
    .transform(res);
}
