/**
 * The render service: POST /render with { html } or { url } → application/pdf.
 * Protected by a shared token (RENDER_TOKEN) sent as `x-render-token`; GET /healthz is open.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { closeSharedBrowser, htmlToPdf, urlToPdf } from './pdf';

export interface ServerOptions {
  port?: number;
  token?: string;
  /** Maximum request body in bytes (default 25 MB). */
  maxBody?: number;
}

function readBody(req: IncomingMessage, maxBody: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBody) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

export function createRenderServer(opts: ServerOptions = {}) {
  const token = opts.token ?? process.env.RENDER_TOKEN ?? '';
  const maxBody = opts.maxBody ?? 25 * 1024 * 1024;
  return createServer(async (req, res) => {
    const started = Date.now();
    try {
      if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, JSON.stringify({ ok: true }));
      if (req.method !== 'POST' || req.url !== '/render') return send(res, 404, JSON.stringify({ error: 'not found' }));
      if (token && req.headers['x-render-token'] !== token) return send(res, 401, JSON.stringify({ error: 'unauthorized' }));
      const body = JSON.parse(await readBody(req, maxBody)) as { html?: string; url?: string; footerText?: string; headers?: Record<string, string> };
      let pdf: Buffer;
      if (typeof body.html === 'string') pdf = await htmlToPdf(body.html, { footerText: body.footerText });
      else if (typeof body.url === 'string') pdf = await urlToPdf(body.url, { footerText: body.footerText, headers: body.headers });
      else return send(res, 400, JSON.stringify({ error: 'html or url required' }));
      res.setHeader('x-render-ms', String(Date.now() - started));
      return send(res, 200, pdf, 'application/pdf');
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', service: 'render', message: e instanceof Error ? e.message : String(e) }));
      return send(res, 500, JSON.stringify({ error: e instanceof Error ? e.message : 'render failed' }));
    }
  });
}

export async function startServer(opts: ServerOptions = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createRenderServer(opts);
  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    port: actualPort,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closeSharedBrowser();
    },
  };
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  startServer().then(({ port }) => console.log(JSON.stringify({ level: 'info', service: 'render', message: `listening on ${port}` })));
}
