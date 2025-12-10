/**
 * NextAuth configuration for the compliance dashboard.
 * Handles Google auth, Neon user lookup, and audit events.
 */

import NextAuth, { NextAuthOptions, User } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { pool } from '@/lib/db';
import { logAuthEvent } from '@/lib/audit/logAuditEvent';

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
  is_internal: boolean;
  allowed_regions: string[];
  has_all_regions: boolean;
}

async function getUserFromDb(email: string): Promise<DbUser | null> {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query<DbUser>(
        `SELECT id, email, full_name, display_name, role, is_active, is_admin,
                COALESCE(is_superadmin, false) as is_superadmin,
                COALESCE(is_internal, false) as is_internal,
                allowed_regions, has_all_regions
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
// EXTERNAL ALLOWLIST & INTERNAL STAFF
// ============================================================================

// OWNER EXCEPTION: jrc7192@gmail.com is explicitly allowed regardless of domain
// This is intentional and must be preserved in any auth tightening
const OWNER_EXCEPTION_EMAIL = 'jrc7192@gmail.com';

// INTERNAL STAFF: These emails are treated as internal users, not client users.
// They will have is_internal = true in the database and be excluded from
// client-facing admin user lists.
const INTERNAL_EMAILS = new Set<string>([
  'tyler.weaver@acadian.com',
  'jrc7192@gmail.com',
]);

/**
 * Fallback user for owner exception when DB lookup fails.
 * This is a safety net - the user should normally exist in the database.
 */
function getOwnerExceptionUser(): DbUser {
  return {
    id: 'owner-exception-user',
    email: OWNER_EXCEPTION_EMAIL,
    full_name: 'Jake Chaumont (Owner)',
    display_name: 'Jake Chaumont',
    role: 'admin',
    is_active: true,
    is_admin: true,
    is_superadmin: true,
    is_internal: true,
    allowed_regions: [],
    has_all_regions: true,
  };
}

/**
 * Update a user's is_internal flag if needed.
 * Called during sign-in for known internal emails.
 */
async function ensureIsInternal(email: string): Promise<void> {
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE users SET is_internal = true, updated_at = now()
         WHERE LOWER(email) = LOWER($1) AND is_internal = false`,
        [email]
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[NextAuth] Failed to update is_internal:', error);
  }
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
     * jwt callback - runs when JWT is created or updated
     * Store is_superadmin and is_internal in the token so middleware can access it
     */
    async jwt({ token, user, trigger }) {
      // On initial sign-in, look up user in DB to get is_superadmin, is_internal, etc.
      if (trigger === 'signIn' && token.email) {
        const email = token.email.toLowerCase();
        const dbUser = await getUserFromDb(email);

        if (dbUser) {
          token.is_superadmin = dbUser.is_superadmin;
          token.is_admin = dbUser.is_admin;
          token.is_internal = dbUser.is_internal;
          token.role = dbUser.role;
          token.allowed_regions = dbUser.allowed_regions;
          token.has_all_regions = dbUser.has_all_regions;
        } else if (email === OWNER_EXCEPTION_EMAIL.toLowerCase()) {
          // Fallback for owner exception if DB lookup fails
          token.is_superadmin = true;
          token.is_admin = true;
          token.is_internal = true;
        }
      }

      return token;
    },

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

      // 2. Must be @acadian.com domain OR owner exception
      const isOwnerException = email === OWNER_EXCEPTION_EMAIL.toLowerCase();
      if (!email.endsWith('@acadian.com') && !isOwnerException) {
        console.warn(`[NextAuth] Sign-in denied: Non-Acadian email (${email})`);
        return false;
      }

      // 3. Look up user in database
      const dbUser = await getUserFromDb(email);

      // 4. If user found and active, allow
      if (dbUser && dbUser.is_active) {
        // 4a. If this is a known internal email but is_internal is false, update it
        if (INTERNAL_EMAILS.has(email) && !dbUser.is_internal) {
          await ensureIsInternal(email);
        }
        console.log(`[NextAuth] Sign-in allowed: ${email} (role: ${dbUser.role})`);
        return true;
      }

      // 5. OWNER EXCEPTION: Allow jrc7192@gmail.com even if not in DB
      // This user should be in the DB, but this is a safety net
      if (isOwnerException) {
        console.log(`[NextAuth] OWNER EXCEPTION: Allowing ${email}`);
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

        // OWNER EXCEPTION: Use fallback if DB lookup fails
        // This is a safety net - the user should normally exist in the database
        if (!dbUser && email === OWNER_EXCEPTION_EMAIL.toLowerCase()) {
          console.log('[NextAuth] OWNER EXCEPTION: Using fallback user for session');
          dbUser = getOwnerExceptionUser();
        }

        if (dbUser) {
          // Attach custom fields to session.user
          session.user.role = dbUser.role;
          session.user.allowed_regions = dbUser.allowed_regions;
          session.user.has_all_regions = dbUser.has_all_regions;
          session.user.is_admin = dbUser.is_admin;
          session.user.is_superadmin = dbUser.is_superadmin;
          session.user.is_internal = dbUser.is_internal;
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
    async signIn({ user, account, isNewUser }) {
      try {
        const email = user.email?.toLowerCase();
        if (!email) return;

        // Get user info from database for audit logging
        const dbUser = await getUserFromDb(email);

        // Use centralized audit logging
        await logAuthEvent('LOGIN_SUCCESS', email, {
          provider: account?.provider,
          is_new_user: isNewUser,
          role: dbUser?.role,
          user_id: dbUser?.id,
        });
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

        // Use centralized audit logging
        await logAuthEvent('LOGOUT', email, {});
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
