export interface RefreshTokenInputDto {
  refreshTokenHash: string;
  userId: string;
  expiresAt: Date;
}
