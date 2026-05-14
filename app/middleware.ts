import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export default NextAuth(authConfig).auth;

// Negative lookahead excludes static assets, _next internals, the auth API itself,
// any future cron/webhook routes, the favicon, the ICS calendar feed (token-
// gated, intended to be consumed by external calendar apps without cookies),
// and the PWA shell files (sw.js, manifest, offline page, icons) — the
// browser fetches these without auth cookies during install/update, so a
// 307→/login here would prevent the service worker from ever registering.
// Mirrors the prior burn from TicketHub where withAuth 307'd a cron route
// silently for a day.
export const config = {
  matcher: [
    // `p/` is the client-portal token-gated public surface (N8) — same
    // pattern as `api/ics`: the token IS the auth, cookie-based auth
    // would block the intended audience (client browser w/ no session).
    '/((?!_next/static|_next/image|favicon.ico|sw.js|offline|manifest.webmanifest|apple-touch-icon.png|icons/|api/auth|api/cron|api/webhooks|api/health|api/ics|p/).*)',
  ],
};
