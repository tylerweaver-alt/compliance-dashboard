console.log('[Auth Debug] GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 30) + '...');

/**
 * NextAuth configuration for the compliance dashboard.
 * Handles Google auth, Neon user lookup, audit events, and guarded dev bypass.
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
// SUPERADMIN ALLOWLIST
// Secondary safeguard: these emails are always treated as superadmin if authenticated
// ============================================================================

const SUPERADMIN_EMAIL_ALLOWLIST = new Set([
  'tylerkweaver20@gmail.com',
  'jrc7192@gmail.com',
]);

function isEmailAllowlistedSuperadmin(email: string): boolean {
  return SUPERADMIN_EMAIL_ALLOWLIST.has(email.toLowerCase());
}

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
  is_superadmin: boolean;
  allowed_regions: string[];
  has_all_regions: boolean;
}

async function getUserFromDb(email: string): Promise<DbUser | null> {
  try {
    const client = await pool.connect();
    try {
      // Use COALESCE for is_superadmin in case the column doesn't exist yet (migration not run)
      // This query handles both scenarios: column exists or doesn't exist
      const result = await client.query<DbUser>(
        `SELECT
           id, email, full_name, display_name, role, is_active, is_admin,
           allowed_regions, has_all_regions,
           COALESCE(is_superadmin, false) AS is_superadmin
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
    // If the query fails (e.g., is_superadmin column doesn't exist), try without it
    console.error('[NextAuth] Database query failed, trying fallback:', error);
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT id, email, full_name, display_name, role, is_active, is_admin, allowed_regions, has_all_regions
           FROM users
           WHERE LOWER(email) = LOWER($1)
           LIMIT 1`,
          [email]
        );
        if (result.rows[0]) {
          return { ...result.rows[0], is_superadmin: false } as DbUser;
        }
        return null;
      } finally {
        client.release();
      }
    } catch (fallbackError) {
      console.error('[NextAuth] Fallback query also failed:', fallbackError);
      return null;
    }
  }
}

// ============================================================================
// DEV-ONLY FAILSAFE
// Only active when BOTH:
//   1. NODE_ENV === 'development'
//   2. LOCAL_DEV_BYPASS === '1'
// This should never be enabled in staging/production. A runtime assertion below
// will throw if the flag is present in non-local environments.
// ============================================================================

const DEV_BYPASS_EMAIL = 'tyler.weaver@acadian.com';
const LOCAL_DEV_BYPASS_ENABLED = process.env.LOCAL_DEV_BYPASS === '1';

function assertSafeDevBypass() {
  if (!LOCAL_DEV_BYPASS_ENABLED) return;

  const nodeEnv = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;

  // Block the flag in non-development environments
  if (nodeEnv && nodeEnv !== 'development') {
    throw new Error('LOCAL_DEV_BYPASS=1 is not allowed when NODE_ENV is not development');
  }
  if (vercelEnv && vercelEnv !== 'development' && vercelEnv !== 'dev' && vercelEnv !== 'local') {
    throw new Error(`LOCAL_DEV_BYPASS=1 is not allowed when VERCEL_ENV=${vercelEnv}`);
  }
}

assertSafeDevBypass();

function isDevBypassEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && LOCAL_DEV_BYPASS_ENABLED;
}

function getDevBypassUser(): DbUser {
  return {
    id: 'dev-bypass-user',
    email: DEV_BYPASS_EMAIL,
    full_name: 'Tyler Weaver (Dev Bypass)',
    display_name: 'Tyler Weaver',
    role: 'admin',
    is_active: true,
    is_admin: true,
    is_superadmin: true,
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

      // 2. Check if email is an allowlisted superadmin (can bypass @acadian.com domain check)
      const isAllowlistedSuperadmin = isEmailAllowlistedSuperadmin(email);

      // 3. Allow specific external emails from env var
      const allowedExternal = (process.env.ALLOWED_EXTERNAL_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (allowedExternal.includes(email)) {
        console.log(`[NextAuth] Sign-in ALLOWED (external override): ${email}`);
        return true;
      }

      // 4. Allowlisted superadmins can bypass domain check, but still need DB check
      if (isAllowlistedSuperadmin) {
        const dbUser = await getUserFromDb(email);
        if (!dbUser) {
          console.warn(`[NextAuth] Sign-in denied (superadmin allowlist): ${email} not in database`);
          return false;
        }
        if (!dbUser.is_active) {
          console.warn(`[NextAuth] Sign-in denied (superadmin allowlist): ${email} is inactive in database`);
          return false;
        }
        console.log(`[NextAuth] Sign-in allowed (superadmin allowlist): ${email}`);
        return true;
      }

      // 5. Allow @acadian.com domain (normal internal users)
      if (!email.endsWith('@acadian.com')) {
        console.warn(`[NextAuth] Sign-in denied: Non-Acadian, not in external allowlist (${email})`);
        return false;
      }

      // 6. Look up user in database
      const dbUser = await getUserFromDb(email);

      // 7. If user found and active, allow
      if (dbUser && dbUser.is_active) {
        console.log(`[NextAuth] Sign-in allowed: ${email} (role: ${dbUser.role})`);
        return true;
      }

      // 8. Otherwise deny
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

          session.user.is_superadmin = Boolean(dbUser.is_superadmin) || isEmailAllowlistedSuperadmin(email);
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
                is_superadmin: Boolean(dbUser?.is_superadmin) || isEmailAllowlistedSuperadmin(email),
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
