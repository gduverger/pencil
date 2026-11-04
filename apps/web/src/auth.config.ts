/**
 * Auth.js configuration shared by the middleware (edge, no database) and the server (with the
 * Drizzle adapter). Sessions are JWTs so the credentials provider used in development and
 * end-to-end tests works alongside the email and Google providers (FR-10.1).
 */
import type { NextAuthConfig } from 'next-auth';

export const authSecret =
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === 'production' ? undefined : 'pencil-dev-secret-change-me');

export const authConfig = {
  secret: authSecret,
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin', verifyRequest: '/signin?sent=1', error: '/signin' },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const protectedPath = path.startsWith('/deals') || path.startsWith('/settings');
      return protectedPath ? Boolean(auth?.user) : true;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (user?.email) token.email = user.email;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
