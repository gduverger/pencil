/** File name for exports: <deal>-<scenario>-<version date>.<ext> (spec 8). */
export function packageFileName(dealName: string, scenario: string, versionDate: string, ext: 'pdf' | 'xlsx' | 'html'): string {
  const slug =
    dealName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'deal';
  return `${slug}-${scenario}-${versionDate}.${ext}`;
}
