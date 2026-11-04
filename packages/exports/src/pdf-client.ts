/** Client for apps/render: POST package HTML (or a package route URL) and receive the PDF. */
export interface RenderClientOptions {
  url: string;
  token?: string;
  timeoutMs?: number;
}

export interface RenderRequest {
  html?: string;
  url?: string;
  footerText?: string;
  headers?: Record<string, string>;
  /** For the service's structured logs only. */
  versionId?: string;
}

export async function renderPdf(req: RenderRequest, opts: RenderClientOptions): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${opts.url.replace(/\/$/, '')}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(opts.token ? { 'x-render-token': opts.token } : {}) },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { error?: string }).error ?? '';
      } catch {
        /* ignore */
      }
      throw new Error(`render service responded ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
