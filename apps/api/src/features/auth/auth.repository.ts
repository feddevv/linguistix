import { pg } from '../../db/pg.js';
import { toRefreshTokenDomain } from '../../utils/mappers.js';
import type { RefreshTokenInputDto, RefreshTokenRow } from './auth.types.js';

class RefreshToken {
  async findRefreshTokenByHash(refreshTokenHash: string) {
    const refreshToken = await pg.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE refresh_token_hash = $1 AND expires_at > NOW()`,
      [refreshTokenHash],
    );

    if (!refreshToken.rows[0]) {
      return null;
    }

    return toRefreshTokenDomain(refreshToken.rows[0]);
  }

  async findRefreshTokenByUserId(userId: string) {
    const refreshToken = await pg.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE refresh_token_hash = $1 AND expires_at > NOW()`,
      [userId],
    );

    if (!refreshToken.rows[0]) {
      return null;
    }

    return toRefreshTokenDomain(refreshToken.rows[0]);
  }

  async updateRefreshToken(oldRefreshTokenHash: string, newRefreshToken: string, expiresAt: Date) {
    const updated = await pg.query(
      `UPDATE refresh_tokens SET refresh_token_hash = $1, expires_at = $2 WHERE refresh_token_hash = $3;`,
      [newRefreshToken, expiresAt, oldRefreshTokenHash],
    );

    return updated.rowCount;
  }

  async createRefreshToken({ refreshTokenHash, userId, expiresAt }: RefreshTokenInputDto) {
    const refreshToken = await pg.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (refresh_token_hash, user_id, expires_at) VALUES ($1, $2, $3) RETURNING *`,
      [refreshTokenHash, userId, expiresAt],
    );

    return toRefreshTokenDomain(refreshToken.rows[0]!);
  }
}

export const RefreshTokenRepo = new RefreshToken();
