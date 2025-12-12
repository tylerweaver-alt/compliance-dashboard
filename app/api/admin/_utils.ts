import { getServerSession, Session } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

const ADMIN_ROLES = ['OM', 'Director', 'VP', 'Admin'];

type AdminSessionResult =
  | { session: Session; user: any; error?: undefined; status?: undefined }
  | { error: string; status: number; session?: undefined; user?: undefined };

export async function requireAdminSession(): Promise<AdminSessionResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return { error: 'UNAUTHORIZED', status: 401 };
  }

  const user: any = session.user;
  const role = user.role as string | undefined;
  const isAdmin = user.is_admin === true;

  if (!isAdmin && (!role || !ADMIN_ROLES.includes(role))) {
    return { error: 'FORBIDDEN', status: 403 };
  }

  return { session, user };
}

