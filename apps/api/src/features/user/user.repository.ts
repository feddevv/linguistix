import type { RegisterInput, Role } from '@repo/shared';
import { pg } from '../../db/pg.js';
import { toUserDomain } from '../../utils/mappers.js';
import { DatabaseError } from 'pg';
import { HttpError } from '../../errors/HttpError.js';
import type { UserRow } from './user.types.js';

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

  async createGoogleUser({
    firstName,
    lastName,
    email,
    googleId,
    role,
  }: {
    firstName: string;
    lastName: string;
    email: string;
    googleId: string;
    role: Role;
  }) {
    try {
      const user = await pg.query<UserRow>(
        `
				INSERT INTO users (first_name, last_name, email, google_id, role)
				VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
			`,
        [firstName, lastName, email, googleId, role],
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
}

export const UserRepo = new User();
