/**
 * Sysadmin API utilities
 * Provides session validation for superadmin-only routes
 */

import { getServerSession, Session } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

type SuperadminSessionResult =
  | { session: Session; user: any; error?: undefined; status?: undefined }
  | { error: string; status: number; session?: undefined; user?: undefined };

/**
 * Require a valid session with superadmin privileges.
 * Returns 401 if not authenticated, 403 if not a superadmin.
 */
export async function requireSuperadminSession(): Promise<SuperadminSessionResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return { error: 'UNAUTHORIZED', status: 401 };
  }

  const user: any = session.user;
  const isSuperadmin = user.is_superadmin === true;

  if (!isSuperadmin) {
    return { error: 'FORBIDDEN', status: 403 };
  }

  return { session, user };
}

