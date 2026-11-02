import type { Plugin } from 'vite';
import { randomUUID } from 'node:crypto';
export function devDiagnosticsPlugin(): Plugin {
  return {
    name: 'local-upload-diagnostics',
    apply: 'serve',
    configureServer(server) {
      const reports = new Map<string, unknown[]>();
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0];
        if (!path?.startsWith('/__dev/upload-diagnostics/')) return next();
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}`) {
          response.statusCode = 403;
          response.end();
          return;
        }
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        if (path.endsWith('/request') && request.method === 'POST') {
          const id = randomUUID();
          if (reports.size >= 5) reports.delete(reports.keys().next().value!);
          reports.set(id, []);
          server.ws.send('construction:upload-diagnostics', { id });
          response.end(JSON.stringify({ id }));
          return;
        }
        const url = new URL(request.url!, 'http://localhost');
        const id = url.searchParams.get('id') ?? '';
        if (!reports.has(id)) {
          response.statusCode = 404;
          response.end('{}');
          return;
        }
        if (path.endsWith('/report') && request.method === 'POST') {
          try {
            let body = '';
            for await (const chunk of request) {
              body += chunk;
              if (body.length > 24000) throw Error('too large');
            }
            const report = JSON.parse(body);
            const items = reports.get(id)!;
            if (items.length < 5) items.push(report);
            response.end('{}');
          } catch {
            response.statusCode = 400;
            response.end('{}');
          }
          return;
        }
        if (path.endsWith('/result') && request.method === 'GET') {
          response.end(JSON.stringify({ reports: reports.get(id) }));
          return;
        }
        response.statusCode = 405;
        response.end('{}');
      });
    },
  };
}
