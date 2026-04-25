import type { NextAuthConfig } from 'next-auth';

// Edge-safe Auth.js config — used by middleware. No DB or bcrypt here.
// The Credentials provider is added in auth.ts (Node runtime only).
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;

      // Public paths
      if (path.startsWith('/login') || path.startsWith('/api/auth')) {
        return true;
      }

      if (!isLoggedIn) return false;

      // Admin-only areas
      if (path.startsWith('/admin')) {
        return role === 'admin';
      }

      // Scheduler areas (board + projects management) — admin or scheduler
      if (path.startsWith('/board') || path.startsWith('/projects')) {
        return role === 'admin' || role === 'scheduler';
      }

      // Everything else (/, /me, /account) — any logged-in user
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role && token.username) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.username = token.username;
        if (token.name) session.user.name = token.name;
      }
      return session;
    },
  },
  providers: [], // populated in auth.ts
} satisfies NextAuthConfig;
