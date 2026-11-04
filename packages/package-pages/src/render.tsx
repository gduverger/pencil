/** Static HTML rendering of the package, used by the PDF renderer, the CLI and the share viewer. */
import { renderToStaticMarkup } from 'react-dom/server';
import { PackageDocument } from './document';
import { PACKAGE_CSS } from './styles';
import type { PackageProps } from './types';

export interface RenderHtmlOptions {
  /** Extra CSS appended after the package styles (for example a letterhead font). */
  extraCss?: string;
  /** Document title; defaults to the deal name. */
  title?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderPackageBody(props: PackageProps): string {
  return renderToStaticMarkup(<PackageDocument props={props} />);
}

export function renderPackageHtml(props: PackageProps, opts: RenderHtmlOptions = {}): string {
  const title = opts.title ?? `${props.version.dealName} — feasibility package`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${PACKAGE_CSS}${opts.extraCss ?? ''}</style>
</head>
<body class="pkg">
${renderPackageBody(props)}
</body>
</html>`;
}

export { packageFileName } from './files';
