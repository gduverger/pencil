# apps/render — the Playwright Chromium service that renders package routes to PDF (spec 11.2).
# Build from the repository root so the workspace lockfile is in the context:
#   docker build -f apps/render/Dockerfile -t pencil-render .
#   docker run --rm -p 8787:8787 -e RENDER_TOKEN=secret pencil-render
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production PORT=8787 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Inter is the package typeface; fonts-inter installs it system-wide so Chromium finds it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-inter \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -f

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @pencil/render...

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8787/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["pnpm", "--filter", "@pencil/render", "start"]
