import type { RefreshTokenRow, RefreshTokenDomain } from '../features/auth/auth.types.js';
import type { UserDomain, UserRow } from '../features/user/user.types.js';

export function toUserDomain(data: UserRow): UserDomain {
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    password: data.password,
    createdAt: data.created_at,
    role: data.role,
  };
}

export function toUserDomainList(data: UserRow[]): UserDomain[] {
  return data.map((row) => toUserDomain(row));
}

export function toRefreshTokenDomain(data: RefreshTokenRow): RefreshTokenDomain {
  return {
    id: data.id,
    refreshTokenHash: data.refresh_token_hash,
    userId: data.user_id,
    expiresAt: data.expires_at,
  };
}

export function toRefreshTokenDomainList(data: RefreshTokenRow[]): RefreshTokenDomain[] {
  return data.map((row) => toRefreshTokenDomain(row));
}
