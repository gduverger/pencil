import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Edge middleware uses the database-free config; the `authorized` callback protects deal routes.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/deals/:path*', '/settings/:path*'],
};
