/**
 * NextAuth Configuration for Acadian Compliance Dashboard
 * 
 * Features:
 * - Google OAuth provider (only @acadian.com emails)
 * - Neon Postgres integration for user lookup (role, regions)
 * - DEV-ONLY failsafe for tyler.weaver@acadian.com
 */

import NextAuth, { NextAuthOptions, User } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { Pool } from 'pg';

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ============================================================================
// HELPER: Look up user in Neon Postgres
// ============================================================================

interface DbUser {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  role: string;
  is_active: boolean;
  is_admin: boolean;
  allowed_regions: string[];
  has_all_regions: boolean;
}

async function getUserFromDb(email: string): Promise<DbUser | null> {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query<DbUser>(
        `SELECT id, email, full_name, display_name, role, is_active, is_admin, allowed_regions, has_all_regions
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[NextAuth] Database query failed:', error);
    return null;
  }
}

// ============================================================================
// DEV-ONLY FAILSAFE
// When both conditions are true:
//   1. NODE_ENV === 'development' OR DEV_BYPASS_AUTH === '1'
//   2. Email is tyler.weaver@acadian.com
// 
// This allows login even if Neon is down or user row is misconfigured.
// REMOVE or disable this once the project goes to production.
// ============================================================================

function isDevBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.DEV_BYPASS_AUTH === '1'
  );
}

const DEV_BYPASS_EMAIL = 'tyler.weaver@acadian.com';

function getDevBypassUser(): DbUser {
  return {
    id: 'dev-bypass-user',
    email: DEV_BYPASS_EMAIL,
    full_name: 'Tyler Weaver (Dev Bypass)',
    display_name: 'Tyler Weaver',
    role: 'admin',
    is_active: true,
    is_admin: true,
    allowed_regions: [],
    has_all_regions: true,
  };
}

// ============================================================================
// NEXTAUTH OPTIONS
// ============================================================================

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    /**
     * signIn callback - runs when user attempts to sign in
     * Return true to allow, false to deny, or a URL to redirect
     */
    async signIn({ user, account, profile }) {
      const email = user.email?.toLowerCase();

      // 1. Must have an email
      if (!email) {
        console.warn('[NextAuth] Sign-in denied: No email provided');
        return false;
      }

      // 2. Must be @acadian.com domain
      if (!email.endsWith('@acadian.com')) {
        console.warn(`[NextAuth] Sign-in denied: Non-Acadian email (${email})`);
        return false;
      }

      // 3. Look up user in database
      const dbUser = await getUserFromDb(email);

      // 4. If user found and active, allow
      if (dbUser && dbUser.is_active) {
        console.log(`[NextAuth] Sign-in allowed: ${email} (role: ${dbUser.role})`);
        return true;
      }

      // 5. DEV FAILSAFE: Allow tyler.weaver@acadian.com even if DB lookup fails
      if (isDevBypassEnabled() && email === DEV_BYPASS_EMAIL) {
        console.warn(`[NextAuth] DEV BYPASS: Allowing ${email} despite DB issues`);
        return true;
      }

      // 6. Otherwise deny
      if (!dbUser) {
        console.warn(`[NextAuth] Sign-in denied: User not found in database (${email})`);
      } else if (!dbUser.is_active) {
        console.warn(`[NextAuth] Sign-in denied: User is inactive (${email})`);
      }
      return false;
    },

    /**
     * session callback - runs whenever session is checked
     * Attach user role/region data from database to the session
     */
    async session({ session, token }) {
      if (session.user?.email) {
        const email = session.user.email.toLowerCase();
        let dbUser = await getUserFromDb(email);

        // DEV FAILSAFE: Use bypass user if DB lookup fails
        if (!dbUser && isDevBypassEnabled() && email === DEV_BYPASS_EMAIL) {
          console.warn('[NextAuth] DEV BYPASS: Using fallback user for session');
          dbUser = getDevBypassUser();
        }

        if (dbUser) {
          // Attach custom fields to session.user
          session.user.role = dbUser.role;
          session.user.allowed_regions = dbUser.allowed_regions;
          session.user.has_all_regions = dbUser.has_all_regions;
          session.user.is_admin = dbUser.is_admin;
          session.user.display_name = dbUser.display_name || dbUser.full_name || session.user.name;
        }
      }
      return session;
    },
  },

  pages: {
    signIn: '/AcadianDashboard',  // Redirect to our custom login page
    error: '/AcadianDashboard',   // Also redirect errors there
  },

  events: {
    /**
     * signIn event - fires after successful sign-in
     */
    async signIn({ user, account, profile, isNewUser }) {
      try {
        const email = user.email?.toLowerCase();
        if (!email) return;

        // Get user ID from database for audit logging
        const dbUser = await getUserFromDb(email);
        const userId = dbUser?.id || null;

        // Log the login event directly to audit_logs
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO audit_logs (actor_user_id, actor_email, action, target_type, target_id, summary, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              userId,
              email,
              'LOGIN',
              'session',
              email,
              `User ${email} logged in via ${account?.provider || 'unknown'}`,
              JSON.stringify({
                provider: account?.provider,
                is_new_user: isNewUser,
                role: dbUser?.role,
              }),
            ]
          );
        } finally {
          client.release();
        }
        console.log(`[Audit] LOGIN: ${email}`);
      } catch (err) {
        console.error('[Audit] Failed to log LOGIN event:', err);
      }
    },

    /**
     * signOut event - fires when user signs out
     */
    async signOut({ token }) {
      try {
        const email = (token?.email as string)?.toLowerCase();
        if (!email) return;

        // Get user ID from database for audit logging
        const dbUser = await getUserFromDb(email);
        const userId = dbUser?.id || null;

        // Log the logout event directly to audit_logs
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO audit_logs (actor_user_id, actor_email, action, target_type, target_id, summary, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              userId,
              email,
              'LOGOUT',
              'session',
              email,
              `User ${email} logged out`,
              JSON.stringify({}),
            ]
          );
        } finally {
          client.release();
        }
        console.log(`[Audit] LOGOUT: ${email}`);
      } catch (err) {
        console.error('[Audit] Failed to log LOGOUT event:', err);
      }
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

