import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/deals');
  return (
    <div className="mx-auto max-w-2xl py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Does this site pencil?</h1>
      <p className="mt-3 text-neutral-600">
        Pencil takes a Massachusetts multifamily site and about a dozen assumptions and produces a bank-and-partner-ready feasibility package. Every number comes from a tested calculation engine, every assumption carries a source, a date and a benchmark check, and the answer is always a range.
      </p>
      <Link href="/signin" className="mt-6 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700">
        Sign in to start a deal
      </Link>
    </div>
  );
}
