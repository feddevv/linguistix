import { UserRepo } from './auth.repository.js';
import type { LoginInput, RegisterInput } from '@repo/shared';
import { compare, hash } from 'bcrypt';
import { HttpError } from '../errors/HttpError.js';
import jwt from 'jsonwebtoken';

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

export async function login({ email, password }: LoginInput) {
  const user = await UserRepo.findUserByEmail(email);

  if (!user) throw new HttpError(404, 'Email or password is incorrect');

  const isMatch = await compare(password, user.password);

  if (!isMatch) throw new HttpError(404, 'Email or password is incorrect');

  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.SECRET_KEY!,
    {
      expiresIn: '15m',
    },
  );

  const refreshToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.SECRET_KEY!,
    {
      expiresIn: '15d',
    },
  );

  return {
    user,
    accessToken,
    refreshToken,
  };
}
