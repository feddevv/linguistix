import type { Role } from '@repo/shared';

export interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  created_at: Date;
  role: Role;
}

export interface UserDomain {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  createdAt: Date;
  role: Role;
}

export interface RefreshTokenRow {
  id: number;
  refresh_token_hash: string;
  user_id: string;
  expires_at: Date;
}

export interface RefreshTokenDomain {
  id: number;
  refreshTokenHash: string;
  userId: string;
  expiresAt: Date;
}

export type RefreshTokenInputDto = Pick<
  RefreshTokenDomain,
  'refreshTokenHash' | 'userId' | 'expiresAt'
>;
