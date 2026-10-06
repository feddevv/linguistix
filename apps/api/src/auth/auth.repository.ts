import { DatabaseError } from 'pg';
import { pg } from '../db/pg.js';
import { toUserDomain } from '../utils/mappers.js';
import type { UserRow } from './auth.types.js';
import { HttpError } from '../errors/HttpError.js';
import type { RegisterInput } from '@repo/shared';

class User {
  async createUser({ firstName, lastName, email, password, role }: RegisterInput) {
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
}

export const UserRepo = new User();
