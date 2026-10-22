import type {
  RefreshTokenRow,
  RefreshTokenDomain,
  EmailVerificationTokenRow,
  EmailVerificationTokenDto,
} from '../features/auth/auth.types.js';
import type { UserDomain, UserRow } from '../features/user/user.types.js';

export function toUserDomain(data: UserRow): UserDomain {
  return {
    id: data.id,
    googleId: data.google_id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    password: data.password,
    createdAt: data.created_at,
    role: data.role,
    isVerified: data.is_verified,
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

export function toEmailVerificationTokenDto(
  data: EmailVerificationTokenRow,
): EmailVerificationTokenDto {
  return {
    id: data.id,
    expiresAt: data.expires_at,
    tokenHash: data.token_hash,
    usedAt: data.used_at,
    userId: data.user_id,
  };
}
