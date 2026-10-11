import { RefreshTokenRepo } from './auth.repository.js';
import type { LoginInput, RegisterInput } from '@repo/shared';
import { compare, hash } from 'bcrypt';
import { HttpError } from '../../errors/HttpError.js';
import jwt from 'jsonwebtoken';
import { hashString } from './utils/hashing.js';
import { UserRepo } from '../user/user.repository.js';

export async function register({ firstName, lastName, password, email, role }: RegisterInput) {
  const sha256hash = hashString(password);
  const passwordHash = await hash(sha256hash, 10);

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

  if (!user) throw new HttpError(401, 'Email or password is incorrect');

  const sha256hash = hashString(password);
  const isMatch = await compare(sha256hash, user.password);

  if (!isMatch) throw new HttpError(401, 'Email or password is incorrect');

  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() },
    process.env.SECRET_KEY!,
    {
      expiresIn: '15m',
    },
  );

  const refreshToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() },
    process.env.SECRET_KEY!,
    {
      expiresIn: '15d',
    },
  );

  const date = new Date();
  date.setDate(date.getDate() + 15);

  const hashedRefreshToken = hashString(refreshToken);
  await RefreshTokenRepo.createRefreshToken({
    refreshTokenHash: hashedRefreshToken,
    userId: user.id,
    expiresAt: date,
  });

  return {
    user,
    accessToken,
    refreshToken,
  };
}

export async function refresh(refreshToken: string | undefined) {
  if (!refreshToken) throw new HttpError(401, 'Refresh token is not attached');

  try {
    jwt.verify(refreshToken, process.env.SECRET_KEY!);
  } catch (err) {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const hashedRefreshToken = hashString(refreshToken);
  const dbToken = await RefreshTokenRepo.findRefreshTokenByHash(hashedRefreshToken);

  if (!dbToken) throw new HttpError(401, 'Invalid or expired token');

  const user = await UserRepo.findUserById(dbToken.userId);

  if (!user) throw new HttpError(401, "Current user doesn't exist");

  const newAccessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() },
    process.env.SECRET_KEY!,
    { expiresIn: '15m' },
  );
  const newRefreshToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() },
    process.env.SECRET_KEY!,
    { expiresIn: '15d' },
  );

  const hashedNewRefreshToken = hashString(newRefreshToken);

  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 15);

  await RefreshTokenRepo.updateRefreshToken(
    hashedRefreshToken,
    hashedNewRefreshToken,
    newExpiresAt,
  );

  return { newAccessToken, newRefreshToken };
}
