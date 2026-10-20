// Serves a report on this computer so "Not an issue" can save to the
// audited project. A report opened straight from disk can't write files;
// served, it can. Listens on 127.0.0.1 only, and refuses requests from any
// other page, so a website can't write to the project.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadRemembered, loadRun, saveDismissal, removeDismissal, whoAmI, REASONS } from './dismissals.mjs';

const FILES = { '/': ['report.html', 'text/html; charset=utf-8'], '/report.html': ['report.html', 'text/html; charset=utf-8'], '/screenshot.png': ['screenshot.png', 'image/png'] };

function readBody(req) {
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { fail(e); } });
    req.on('error', fail);
  });
}

// reportDir: a folder written by scripts/audit.mjs. Its findings.json says
// which project and page the report belongs to.
export function serveReport(reportDir, { port = 4780 } = {}) {
  const meta = JSON.parse(readFileSync(join(reportDir, 'findings.json'), 'utf8'));
  const where = { projectDir: meta.projectDir, reportDir };
  const page = meta.page;
  const by = whoAmI(meta.projectDir);
  const mine = (list) => list.filter((d) => d.page === page);

  const server = createServer(async (req, res) => {
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    const { port: p } = server.address();
    const okHost = [`127.0.0.1:${p}`, `localhost:${p}`];
    if (!okHost.includes(req.headers.host) || (req.headers.origin && !okHost.some((h) => req.headers.origin === 'http://' + h))) return send(403, { error: 'Not from this report' });
    const path = new URL(req.url, 'http://x').pathname;
    try {
      if (path === '/api/dismissals') {
        if (req.method === 'GET') return send(200, { by, remembered: mine(loadRemembered(meta.projectDir)), run: mine(loadRun(reportDir)) });
        if (req.method === 'POST') {
          const b = await readBody(req);
          if (!b.check || !b.selector || !b.htmlHash || !REASONS[b.reason]) return send(400, { error: 'Needs check, selector, htmlHash and a reason' });
          const entry = { page, check: b.check, selector: b.selector, htmlHash: b.htmlHash, element: String(b.element ?? ''), reason: b.reason, note: String(b.note ?? '').trim(), by, at: new Date().toISOString() };
          // Whether the person took a suggested reason: calibration data (D32).
          if (b.suggested && REASONS[b.suggested.reason]) entry.suggested = { reason: b.suggested.reason, agree: Number(b.suggested.agree) || 0, of: Number(b.suggested.of) || 0, followed: b.suggested.reason === b.reason };
          saveDismissal(where, entry, b.remember !== false);
          return send(200, { ok: true, entry });
        }
        if (req.method === 'DELETE') {
          const b = await readBody(req);
          removeDismissal(where, { page, check: b.check, selector: b.selector });
          return send(200, { ok: true });
        }
        return send(405, { error: 'Method not allowed' });
      }
      const file = FILES[path];
      if (req.method === 'GET' && file && existsSync(join(reportDir, file[0]))) return send(200, readFileSync(join(reportDir, file[0])), file[1]);
      return send(404, 'Not found', 'text/plain');
    } catch (e) {
      return send(500, { error: e.message });
    }
  });

  return new Promise((ok, fail) => {
    server.once('error', (e) => (e.code === 'EADDRINUSE' && port ? server.listen(0, '127.0.0.1') : fail(e)));
    server.on('listening', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` }));
    server.listen(port, '127.0.0.1');
  });
}
