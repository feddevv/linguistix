import type { PoolClient } from 'pg';
import { pg } from '../../lib/pg.js';
import { toRefreshTokenDomain, toRefreshTokenDomainList } from '../../utils/mappers.js';
import type { RefreshTokenInputDto, RefreshTokenRow } from './auth.types.js';
import { redisClient } from '../../lib/redis.js';

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

  async findRefreshTokensByUserId(userId: string) {
    const refreshToken = await pg.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()`,
      [userId],
    );

    if (!refreshToken || refreshToken.rows.length < 1) {
      return null;
    }

    return toRefreshTokenDomainList(refreshToken.rows);
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

  async deleteRefreshToken(refreshTokenHash: string) {
    await pg.query(`DELETE FROM refresh_tokens WHERE refresh_token_hash = $1`, [refreshTokenHash]);
  }

  async revoke(userId: string, client?: PoolClient) {
    const executor = client ?? pg;
    await executor.query(`DELETE FROM refresh_tokens WHERE user_id = $1;`, [userId]);
  }
}

interface CreateTokenParameters {
  tokenHash: string;
  userId: string;
  subject: string;
}

class VerificationToken {
  async create({ tokenHash, userId, subject }: CreateTokenParameters) {
    await redisClient.SETEX(`verificationToken:${tokenHash}:${subject}`, 15 * 60 * 1000, userId);
  }

  async consume(tokenHash: string, subject: string) {
    const consumed = await redisClient.GETDEL(`verificationToken:${tokenHash}:${subject}`);

    return consumed;
  }
}

export const RefreshTokenRepo = new RefreshToken();
export const VerificationTokenRepo = new VerificationToken();
