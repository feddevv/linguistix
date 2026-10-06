import type { Role } from '@repo/shared';

export interface UserRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  created_at: Date;
  role: Role;
}

export interface UserDomain {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  createdAt: Date;
  role: Role;
}
