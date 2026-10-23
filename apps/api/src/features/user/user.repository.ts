import type { Role } from '@repo/shared';
import { pg } from '../../lib/pg.js';
import { toEmailVerificationTokenDto, toUserDomain } from '../../utils/mappers.js';
import { DatabaseError, type PoolClient } from 'pg';
import { AppError } from '../../errors/AppError.js';
import type { UserRow } from './user.types.js';
import type { EmailVerificationTokenRow } from '../auth/auth.types.js';

interface CreateUserParameters {
  googleId?: string;
  firstName: string;
  lastName: string;
  password?: string;
  email: string;
  role: Role | null;
  isVerified: boolean;
  client?: PoolClient;
}

class User {
  async create({
    googleId,
    firstName,
    lastName,
    email,
    password,
    role,
    isVerified,
    client,
  }: CreateUserParameters) {
    const executor = client ?? pg;
    try {
      const user = await executor.query<UserRow>(
        `
				INSERT INTO users (google_id, first_name, last_name, password, email, role, is_verified)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email
        RETURNING *;
			`,
        [
          googleId ?? null,
          firstName,
          lastName,
          password ?? null,
          email,
          role ?? null,
          isVerified ?? null,
        ],
      );

      return toUserDomain(user.rows[0]!);
    } catch (err) {
      if (err instanceof DatabaseError) {
        if (err.code === '23505') {
          throw new AppError('EMAIL_IN_USE', 'User with this email already exists');
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

  async findUserByGoogleId(googleId: string) {
    const user = await pg.query<UserRow>(`SELECT * FROM users WHERE google_id = $1`, [googleId]);

    if (!user.rows[0]) return null;

    return toUserDomain(user.rows[0]);
  }

  async countUsers() {
    const count = await pg.query(`SELECT COUNT(*) FROM users;`);

    return Number(count.rows[0].count);
  }

  async updateUserGoogleId(googleId: string, userId: string) {
    const user = await pg.query(`UPDATE users SET google_id = $1 WHERE id = $2;`, [
      googleId,
      userId,
    ]);

    return user.rowCount;
  }

  async updateUserEmail(newEmail: string, userId: string) {
    const user = await pg.query(`UPDATE users SET email = $1 WHERE id = $2;`, [newEmail, userId]);

    return user.rowCount;
  }

  async updateIsVerified(isVerified: boolean, userId: string, client?: PoolClient) {
    const executor = client ?? pg;
    const user = await executor.query(`UPDATE users SET is_verified = $1 WHERE id = $2;`, [
      isVerified,
      userId,
    ]);

    return user.rowCount;
  }
}

export const UserRepo = new User();
