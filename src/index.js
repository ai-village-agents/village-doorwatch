const CHECKS = [
  ['Guestbook', 'https://guestbook.aivillage.dev/'],
  ['Surprise Puzzle', 'https://ai-village-agents.github.io/surprise-puzzle/'],
  ['Village Arcade', 'https://ai-village-agents.github.io/village-arcade/'],
  ['Village Bestiary', 'https://ai-village-agents.github.io/village-bestiary/'],
  ['Village Postcard', 'https://ai-village-agents.github.io/village-postcard/'],
  ['Village Yearbook', 'https://ai-village-agents.github.io/village-yearbook/'],
  ['Village Unsent Letters', 'https://ai-village-agents.github.io/village-unsent-letters/'],
  ['Cloudflare Workers Starter', 'https://cloudflare-workers-starter.aivillage.workers.dev/']
];

async function probe(name, url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'AI-Village-Doorwatch/1.0' },
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    const text = await res.text();
    const titleMatch = text.match(/<title>(.*?)<\/title>/i);
    const bytes = new TextEncoder().encode(text).length;
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 160);
    const result = {
      name,
      url,
      ok: res.ok,
      status: res.status,
      bytes,
      preview,
      title: titleMatch ? titleMatch[1] : null,
      content_type: res.headers.get('content-type'),
      elapsed_ms: Date.now() - started
    };
    if (!res.ok) {
      try {
        const retryUrl = new URL(url);
        retryUrl.searchParams.set('__doorwatch_retry', String(Date.now()));
        const retryRes = await fetch(retryUrl.toString(), {
          redirect: 'follow',
          headers: { 'user-agent': 'Mozilla/5.0' },
          cf: { cacheTtl: 0, cacheEverything: false }
        });
        const retryText = await retryRes.text();
        const retryTitleMatch = retryText.match(/<title>(.*?)<\/title>/i);
        result.retry_ok = retryRes.ok;
        result.retry_status = retryRes.status;
        result.retry_bytes = new TextEncoder().encode(retryText).length;
        result.retry_preview = retryText.replace(/\s+/g, ' ').trim().slice(0, 160);
        result.retry_title = retryTitleMatch ? retryTitleMatch[1] : null;
        result.retry_content_type = retryRes.headers.get('content-type');
      } catch (retryError) {
        result.retry_error = String(retryError);
      }
    }
    return result;
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      status: null,
      bytes: null,
      preview: null,
      title: null,
      content_type: null,
      elapsed_ms: Date.now() - started,
      error: String(error)
    };
  }
}

function escapeHtml(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderHtml(results) {
  const rows = results.map(r => `
    <tr>
      <td><a href="${escapeHtml(r.url)}">${escapeHtml(r.name)}</a></td>
      <td>${r.ok ? 'open' : 'check'}</td>
      <td>${r.status ?? '—'}</td>
      <td>${r.bytes ?? '—'}</td>
      <td>${escapeHtml(r.preview || '—')}</td>
      <td>${escapeHtml(r.title || '—')}</td>
      <td>${escapeHtml(r.content_type || '—')}</td>
      <td>${typeof r.retry_ok === 'boolean' || r.retry_status != null ? `${r.retry_ok ? 'ok' : 'check'}/${r.retry_status ?? '—'}` : '—'}</td>
      <td>${r.elapsed_ms}</td>
    </tr>`).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Village Doorwatch</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #10131a; color: #e6eaf2; margin: 0; padding: 24px; }
    h1 { margin: 0 0 8px 0; font-size: 28px; }
    p { color: #a8b3c7; }
    a { color: #8ec5ff; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { border-bottom: 1px solid #283042; padding: 10px 8px; text-align: left; vertical-align: top; }
    th { color: #9db0cf; font-weight: 600; }
    .meta { margin-top: 10px; color: #7f8aa3; }
  </style>
</head>
<body>
  <h1>Village Doorwatch</h1>
  <p>Dynamic spot-checks for a few public village doors.</p>
  <p><a href="/json">/json</a></p>
  <table>
    <thead>
      <tr><th>name</th><th>state</th><th>status</th><th>bytes</th><th>preview</th><th>title</th><th>content-type</th><th>retry</th><th>ms</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="meta">Checked at ${escapeHtml(new Date().toISOString())}</div>
</body>
</html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const results = await Promise.all(CHECKS.map(([name, target]) => probe(name, target)));
    const payload = { checked_at: new Date().toISOString(), results };
    if (url.pathname === '/json') {
      return new Response(JSON.stringify(payload, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    return new Response(renderHtml(results), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
