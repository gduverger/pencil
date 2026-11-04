import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { schema, upsertUser } from '@pencil/db';
import { authConfig } from './auth.config';
import { getDb } from './lib/db';

/** True when the development sign-in (email only, no password) is enabled: local dev and e2e. */
export const devAuthEnabled = process.env.PENCIL_DEV_AUTH === '1' || (process.env.NODE_ENV !== 'production' && !process.env.EMAIL_SERVER && !process.env.AUTH_GOOGLE_ID);

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const db = await getDb();
  const providers: NextAuthConfig['providers'] = [];
  if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
    providers.push(Nodemailer({ server: process.env.EMAIL_SERVER, from: process.env.EMAIL_FROM }));
  }
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
  }
  if (devAuthEnabled) {
    providers.push(
      Credentials({
        id: 'dev',
        name: 'Development sign-in',
        credentials: { email: { label: 'Email', type: 'email' } },
        async authorize(credentials) {
          const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
          if (!email || !email.includes('@')) return null;
          const user = await upsertUser(db, { email, name: email.split('@')[0] });
          return { id: user.id, email: user.email, name: user.name };
        },
      }),
    );
  }
  return {
    ...authConfig,
    adapter: DrizzleAdapter(db, {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    providers,
  };
});

type NextAuthConfig = Parameters<typeof NextAuth>[0] extends infer C ? (C extends (...args: never[]) => unknown ? Awaited<ReturnType<C>> : C) : never;
