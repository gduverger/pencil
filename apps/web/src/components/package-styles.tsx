import { PACKAGE_CSS } from '@pencil/package-pages';

/** Injects the package page stylesheet once so on-screen pages match the PDF. */
export function PackageStyles() {
  return <style dangerouslySetInnerHTML={{ __html: PACKAGE_CSS }} />;
}
