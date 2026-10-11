import type {
  UserDomain,
  UserRow,
  RefreshTokenRow,
  RefreshTokenDomain,
} from '../auth/auth.types.js';

export function toUserDomain(userRow: UserRow): UserDomain {
  return {
    id: userRow.id,
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    email: userRow.email,
    password: userRow.password,
    createdAt: userRow.created_at,
    role: userRow.role,
  };
}

export function toRefreshTokenDomain(refreshTokenRow: RefreshTokenRow): RefreshTokenDomain {
  return {
    id: refreshTokenRow.id,
    refreshTokenHash: refreshTokenRow.refresh_token_hash,
    userId: refreshTokenRow.user_id,
    expiresAt: refreshTokenRow.expires_at,
  };
}
