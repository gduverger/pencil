import type { ReactNode } from 'react';
import { PackageStyles } from '@/components/package-styles';

/** Bare layout for the package route the PDF renderer fetches: no navigation, package styles only. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <PackageStyles />
      </head>
      <body className="pkg">{children}</body>
    </html>
  );
}
