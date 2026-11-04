import { redirect } from 'next/navigation';
import {
  ensureOrganization,
  getOrganization,
  listMemberships,
  type OrgSettings,
  type Role,
} from '@pencil/db';
import { auth } from '@/auth';
import { getDb } from './db';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  role: Role;
  tier: string;
  settings: OrgSettings;
}

/** The signed-in user and their current organization, or a redirect to sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) redirect('/signin');
  const db = await getDb();
  const memberships = await listMemberships(db, user.id);
  const m =
    memberships[0] ??
    (await ensureOrganization(db, user.id, user.name ?? user.email.split('@')[0] ?? 'My'));
  const org = await getOrganization(db, m.orgId);
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    orgId: m.orgId,
    orgName: org.name,
    role: m.role as Role,
    tier: org.tier,
    settings: org.settings,
  };
}

export async function currentUserOrNull(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireUser();
}
