import { DatabaseError } from 'pg';
import { pg } from '../db/pg.js';
import { toUserDomain } from '../utils/mappers.js';
import type { Role, UserRow } from './auth.types.js';

interface CreateUserData {
  firstName: string;
  lastName: string;
  passwordHash: string;
  email: string;
  role: Role;
}

class User {
  async createUser({ firstName, lastName, email, passwordHash, role }: CreateUserData) {
    try {
      const user = await pg.query<UserRow>(
        `
				INSERT INTO users (first_name, last_name, password, email, role)
				VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
			`,
        [firstName, lastName, passwordHash, email, role],
      );

      return toUserDomain(user.rows[0]!);
    } catch (err) {
      if (err instanceof DatabaseError) {
        if (err.code === '23505') {
          throw new Error('User with this email already exists');
        }
      }

      throw err;
    }
  }
}

export const UserRepo = new User();
