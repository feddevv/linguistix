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

export interface EmailVerificationTokenRow {
  id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  user_id: string;
}

export interface EmailVerificationTokenDto {
  id: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  userId: string;
}
