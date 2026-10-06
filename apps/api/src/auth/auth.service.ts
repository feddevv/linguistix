import { UserRepo } from './auth.repository.js';
import type { Role, UserInputDTO } from './auth.types.js';
import { hash } from 'bcrypt';

export async function register({ firstName, lastName, password, email, role }: UserInputDTO) {
  const passwordHash = await hash(password, 10);

  const user = await UserRepo.createUser({ firstName, lastName, passwordHash, email, role });

  return user;
}
