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
