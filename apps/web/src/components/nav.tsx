import Link from 'next/link';
import { signOut } from '@/auth';
import type { CurrentUser } from '@/lib/session';

export function TopNav({ user }: { user: CurrentUser | null }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-5">
          <Link href={user ? '/deals' : '/'} className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <span className="inline-block h-5 w-5 rounded bg-blue-600" aria-hidden />
            Pencil
          </Link>
          {user ? (
            <nav className="flex items-center gap-4 text-sm text-neutral-600">
              <Link href="/deals" className="hover:text-neutral-900">
                Deals
              </Link>
              <Link href="/settings" className="hover:text-neutral-900">
                Settings
              </Link>
            </nav>
          ) : null}
        </div>
        {user ? (
          <div className="flex items-center gap-3 text-sm text-neutral-600">
            <span className="hidden sm:inline">{user.orgName}</span>
            <span className="hidden text-neutral-400 sm:inline">·</span>
            <span>{user.email}</span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <button type="submit" className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link href="/signin" className="text-sm text-neutral-700 hover:text-neutral-900">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
