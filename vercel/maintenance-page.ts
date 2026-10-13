// Standalone snapshot of src/assets/brand/my-logo.svg, checked against the source in tests.
// Inline markup and styles keep this response independent of every blocked asset.
const logo = `<svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 37"><defs><linearGradient id="linear-gradient" x1="5.19" y1="-11.99" x2="104.05" y2="35.44" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#791916"/><stop offset="1" stop-color="#e42b35"/></linearGradient><linearGradient id="linear-gradient-2" x1="6.68" y1="-15.1" x2="105.54" y2="32.34" xlink:href="#linear-gradient"/><linearGradient id="linear-gradient-3" x1="-3.1" y1="5.29" x2="95.76" y2="52.72" xlink:href="#linear-gradient"/></defs><rect x="90.91" y="26.77" width="9.09" height="9.09" style="fill:url(#linear-gradient);"/><polygon points="86.36 -.5 72.73 22.23 72.73 35.86 63.64 35.86 63.64 22.23 50 -.5 59.09 -.5 68.18 13.14 77.27 -.5 86.36 -.5" style="fill:url(#linear-gradient-2);"/><polygon points="9.09 35.86 0 35.86 0 -.5 9.09 -.5 22.73 26.77 36.36 -.5 45.45 -.5 45.45 35.86 36.36 35.86 36.36 17.68 27.27 35.86 18.18 35.86 9.09 17.68 9.09 35.86" style="fill:url(#linear-gradient-3);"/></svg>`

const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="theme-color" content="#0e1014">
  <title>Maintenance en cours · MY.</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #f5f7fa; background: #0e1014; line-height: 1.65; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; min-height: 100svh; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); }
    main { min-width: 0; width: 100%; max-width: 760px; padding: clamp(28px, 6vw, 64px); border: 1px solid #2b3039; border-top: 3px solid #e22b35; border-radius: 12px; background: #15181d; }
    .logo { width: 100px; margin-bottom: clamp(40px, 7vw, 64px); }
    .logo svg { display: block; width: 100%; height: auto; overflow: visible; }
    .eyebrow { margin: 0 0 16px; color: #a6adb7; font-size: .8rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
    .eyebrow::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 12px; background: #e22b35; }
    h1 { margin: 0; max-width: 20ch; font-size: clamp(1.75rem, 4.6vw, 2.75rem); font-weight: 600; line-height: 1.2; letter-spacing: -.03em; overflow-wrap: anywhere; text-wrap: balance; }
    .message { max-width: 48ch; margin: 24px 0 0; color: #a6adb7; font-size: 1rem; }
    .thanks { margin: 32px 0 0; padding-top: 24px; border-top: 1px solid #2b3039; color: #a6adb7; font-size: .875rem; }
    @media (max-width: 420px) { body { padding: 16px; } main { padding: 28px 24px; } }
  </style>
</head>
<body>
  <main aria-labelledby="maintenance-title">
    <div class="logo" aria-hidden="true">${logo}</div>
    <p class="eyebrow">Maintenance en cours</p>
    <h1 id="maintenance-title">MY. est momentanément indisponible</h1>
    <p class="message">Une maintenance est en cours pour prendre soin de MY. Le service reviendra prochainement.</p>
    <p class="thanks">Merci pour votre patience.</p>
  </main>
</body>
</html>`

export function maintenanceResponse(request: Request): Response {
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  })
}
