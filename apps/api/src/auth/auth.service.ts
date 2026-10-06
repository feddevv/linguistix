import { UserRepo } from './auth.repository.js';
import type { RegisterInput } from '@repo/shared';
import { hash } from 'bcrypt';

export async function register({ firstName, lastName, password, email, role }: RegisterInput) {
  const passwordHash = await hash(password, 10);

  const user = await UserRepo.createUser({
    firstName,
    lastName,
    password: passwordHash,
    email,
    role,
  });

  return user;
}
