import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export default NextAuth(authConfig).auth;

// Negative lookahead excludes static assets, _next internals, the auth API itself,
// any future cron/webhook routes, the favicon, and the ICS calendar feed (token-
// gated, intended to be consumed by external calendar apps without cookies).
// Mirrors the prior burn from TicketHub where withAuth 307'd a cron route
// silently for a day.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|api/cron|api/webhooks|api/health|api/ics).*)'],
};
