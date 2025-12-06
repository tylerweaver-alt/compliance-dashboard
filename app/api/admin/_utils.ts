import { getServerSession, Session } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

const ADMIN_ROLES = ['OM', 'Director', 'VP', 'Admin'];

type AdminSessionResult =
  | { session: Session; user: any; error?: undefined; status?: undefined }
  | { error: string; status: number; session?: undefined; user?: undefined };

export async function requireAdminSession(): Promise<AdminSessionResult> {
  // AUTHENTICATION BYPASSED - Always return mock admin session
  const mockSession: Session = {
    user: {
      name: 'Admin User',
      email: 'admin@example.com',
      image: null,
      role: 'admin',
      is_admin: true,
      has_all_regions: true,
      allowed_regions: [],
      display_name: 'Admin User',
    },
    expires: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
  };

  const mockUser = mockSession.user;

  return { session: mockSession, user: mockUser };
}

