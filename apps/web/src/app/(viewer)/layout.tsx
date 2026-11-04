import type { ReactNode } from 'react';
import '../globals.css';
import { PackageStyles } from '@/components/package-styles';

/** The read-only share viewer layout: readable on a phone, no sign-in, no navigation. */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <PackageStyles />
      </head>
      <body className="pkg">{children}</body>
    </html>
  );
}
