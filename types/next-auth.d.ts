/**
 * NextAuth type extensions for Acadian Compliance Dashboard
 *
 * Extends the default NextAuth types to include custom user properties
 * that come from our Neon Postgres users table.
 */

import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      // Custom properties from users table
      role?: string;
      allowed_regions?: string[];
      has_all_regions?: boolean;
      is_admin?: boolean;
      is_superadmin?: boolean;
      is_internal?: boolean;
      display_name?: string | null;
    };
  }

  interface User {
    role?: string;
    allowed_regions?: string[];
    has_all_regions?: boolean;
    is_admin?: boolean;
    is_superadmin?: boolean;
    is_internal?: boolean;
    display_name?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    allowed_regions?: string[];
    has_all_regions?: boolean;
    is_admin?: boolean;
    is_superadmin?: boolean;
    is_internal?: boolean;
    display_name?: string | null;
  }
}

