import { RefreshTokenRepo } from './auth.repository.js';
import type { LoginInput, RegisterInput } from '@repo/shared';
import { compare, hash } from 'bcrypt';
import { HttpError } from '../../errors/HttpError.js';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { hashString } from './utils/hashing.js';
import { UserRepo } from '../user/user.repository.js';
import { jwtDecode } from 'jwt-decode';
import type { UserDomain } from '../user/user.types.js';

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

  const updated = await RefreshTokenRepo.updateRefreshToken(
    hashedRefreshToken,
    hashedNewRefreshToken,
    newExpiresAt,
  );

  if (!updated || updated < 1) throw new HttpError(401, 'Invalid or expired token');

  return { newAccessToken, newRefreshToken };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;

  const hashedRefreshToken = hashString(refreshToken);
  await RefreshTokenRepo.deleteRefreshToken(hashedRefreshToken);
}

interface GoogleJWTPayload extends JwtPayload {
  email: string;
  email_verified: boolean;
  at_hash: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
}
export async function handleGoogleCallback(code: string) {
  const response = await fetch(`https://oauth2.googleapis.com/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://localhost:3000/api/auth/google/callback',
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!,
    }),
  });

  if (!response.ok) throw new HttpError(500, 'Internal server error');

  const data = await response.json();
  const decodedJWTPayload = jwtDecode<GoogleJWTPayload>(data.id_token);
  const dbUser = await UserRepo.findUserByGoogleId(decodedJWTPayload.sub!);

  const user = !dbUser
    ? await UserRepo.createGoogleUser({
        firstName: decodedJWTPayload.given_name!,
        lastName: decodedJWTPayload.family_name!,
        email: decodedJWTPayload.email!,
        googleId: decodedJWTPayload.sub!,
        role: 'student',
      })
    : dbUser;

  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
    },
    process.env.SECRET_KEY!,
    {
      expiresIn: '15m',
    },
  );

  const refreshToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
    },
    process.env.SECRET_KEY!,
    {
      expiresIn: '15d',
    },
  );

  const date = new Date();
  date.setDate(date.getDate() + 15);
  await RefreshTokenRepo.createRefreshToken({
    refreshTokenHash: hashString(refreshToken),
    userId: user.id,
    expiresAt: date,
  });

  return {
    accessToken,
    refreshToken,
  };
}
