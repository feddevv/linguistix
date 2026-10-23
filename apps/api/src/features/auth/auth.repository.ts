import type { PoolClient } from 'pg';
import { pg } from '../../db/pg.js';
import {
  toEmailVerificationTokenDto,
  toRefreshTokenDomain,
  toRefreshTokenDomainList,
} from '../../utils/mappers.js';
import type {
  EmailVerificationTokenRow,
  RefreshTokenInputDto,
  RefreshTokenRow,
} from './auth.types.js';

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
}

interface CreateTokenParameters {
  expiresAt: Date;
  tokenHash: string;
  userId: string;
  client?: PoolClient;
}

class EmailVerificationToken {
  async createToken({ expiresAt, tokenHash, userId, client }: CreateTokenParameters) {
    const executor = client ?? pg;
    const token = await executor.query<EmailVerificationTokenRow>(
      `
        INSERT INTO email_verification_tokens (expires_at, token_hash, user_id)
        VALUES ($1, $2, $3) 
        RETURNING *;
      `,
      [expiresAt, tokenHash, userId],
    );

    return toEmailVerificationTokenDto(token.rows[0]!);
  }

  async consumeToken(hashedToken: string, client?: PoolClient) {
    const executor = client ?? pg;
    const token = await executor.query<Pick<EmailVerificationTokenRow, 'user_id'>>(
      `UPDATE email_verification_tokens SET used_at = NOW() 
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING user_id;`,
      [hashedToken],
    );

    if (!token.rows[0]) return null;

    return { userId: token.rows[0].user_id };
  }

  async rotateToken(userId: string, newTokenHash: string, newExpiresAt: Date) {
    const token = await pg.query(
      `
        INSERT INTO email_verification_tokens (token_hash, expires_at, user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE 
        SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, used_at = NULL;
      `,
      [newTokenHash, newExpiresAt, userId],
    );

    return token.rowCount;
  }
}

export const RefreshTokenRepo = new RefreshToken();
export const EmailVerificationTokenRepo = new EmailVerificationToken();
