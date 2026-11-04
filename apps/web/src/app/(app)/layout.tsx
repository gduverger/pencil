import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../globals.css';
import { TopNav } from '@/components/nav';
import { currentUserOrNull } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Pencil',
  description: 'Massachusetts multifamily feasibility, from twelve inputs to a bank-ready package.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUserOrNull().catch(() => null);
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <TopNav user={user} />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
