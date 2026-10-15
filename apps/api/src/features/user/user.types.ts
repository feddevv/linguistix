import type { Role } from '@repo/shared';

export interface UserRow {
  id: string;
  google_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  password: string | null;
  created_at: Date;
  role: Role | null;
}

export interface UserDomain {
  id: string;
  googleId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  password: string | null;
  createdAt: Date;
  role: Role | null;
}
