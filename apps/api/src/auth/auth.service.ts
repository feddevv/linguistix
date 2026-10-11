import { RefreshTokenRepo, UserRepo } from './auth.repository.js';
import type { LoginInput, RegisterInput } from '@repo/shared';
import { compare, hash } from 'bcrypt';
import { HttpError } from '../errors/HttpError.js';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { preparePassword } from './utils/hashing.js';
import { pg } from '../db/pg.js';

export async function register({ firstName, lastName, password, email, role }: RegisterInput) {
  const sha256hash = preparePassword(password);
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

  const sha256hash = preparePassword(password);
  const isMatch = await compare(sha256hash, user.password);

  if (!isMatch) throw new HttpError(401, 'Email or password is incorrect');

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

  const date = new Date();
  date.setDate(date.getDate() + 15);
  await pg.query(
    `INSERT INTO refresh_tokens (refresh_token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [createHash('sha256').update(refreshToken).digest('hex'), user.id, date],
  );

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

  const hashedRefreshToken = createHash('sha256').update(refreshToken).digest('hex');
  const dbToken = await RefreshTokenRepo.findRefreshTokenByHash(hashedRefreshToken);

  if (!dbToken) throw new HttpError(401, 'Invalid or expired token');

  const user = await UserRepo.findUserById(dbToken.userId);

  const newAccessToken = jwt.sign(
    { id: user!.id, email: user!.email, role: user!.role },
    process.env.SECRET_KEY!,
    { expiresIn: '15m' },
  );
  const newRefreshToken = jwt.sign(
    { id: user!.id, email: user!.email, role: user!.role },
    process.env.SECRET_KEY!,
    { expiresIn: '15d' },
  );

  const hashedNewRefreshToken = createHash('sha256').update(newRefreshToken).digest('hex');

  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 15);
  await RefreshTokenRepo.updateRefreshTokenByHash(
    hashedRefreshToken,
    hashedNewRefreshToken,
    newExpiresAt,
  );

  return { newAccessToken, newRefreshToken };
}
