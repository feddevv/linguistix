import { DatabaseError } from 'pg';
import { pg } from '../db/pg.js';
import { toRefreshTokenDomain, toUserDomain } from '../utils/mappers.js';
import type { RefreshTokenInputDto, RefreshTokenRow, UserRow } from './auth.types.js';
import { HttpError } from '../errors/HttpError.js';
import type { RegisterInput } from '@repo/shared';

class User {
  async createUser({
    firstName,
    lastName,
    email,
    password,
    role,
  }: Omit<RegisterInput, 'confirmPassword'>) {
    try {
      const user = await pg.query<UserRow>(
        `
				INSERT INTO users (first_name, last_name, password, email, role)
				VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
			`,
        [firstName, lastName, password, email, role],
      );

      return toUserDomain(user.rows[0]!);
    } catch (err) {
      if (err instanceof DatabaseError) {
        if (err.code === '23505') {
          throw new HttpError(409, 'User with this email already exists');
        }
      }

      throw err;
    }
  }

  async findUserByEmail(email: string) {
    const user = await pg.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);

    if (!user.rows[0]) return null;

    return toUserDomain(user.rows[0]);
  }

  async findUserById(id: string) {
    const user = await pg.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);

    if (!user.rows[0]) return null;

    return toUserDomain(user.rows[0]);
  }
}

class RefreshToken {
  async findRefreshTokenByHash(refreshTokenHash: string) {
    const refreshToken = await pg.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE refresh_token_hash = $1`,
      [refreshTokenHash],
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

export const UserRepo = new User();
export const RefreshTokenRepo = new RefreshToken();
