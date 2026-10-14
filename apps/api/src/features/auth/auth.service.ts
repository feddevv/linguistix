import { RefreshTokenRepo } from './auth.repository.js';
import type { LoginInput, RegisterInput } from '@repo/shared';
import { compare, hash } from 'bcrypt';
import { HttpError } from '../../errors/HttpError.js';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { hashString } from './utils/hashing.js';
import { UserRepo } from '../user/user.repository.js';
import { jwtDecode } from 'jwt-decode';
import { getGoogleTokens } from '../google/google.service.js';
import crypto from 'crypto';

function signTokens(payload: JwtPayload, secretKey = process.env.SECRET_KEY!) {
  const accessToken = jwt.sign({ ...payload, jti: crypto.randomUUID() }, secretKey, {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign({ jti: crypto.randomUUID() }, secretKey, {
    expiresIn: '15d',
  });

  return { accessToken, refreshToken };
}

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
  if (!user.password) throw new HttpError(401, 'Email or passwords is incorrect');
  const isMatch = await compare(sha256hash, user.password);

  if (!isMatch) throw new HttpError(401, 'Email or password is incorrect');

  const { accessToken, refreshToken } = signTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

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

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = signTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

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

export function google() {
  const state = crypto.randomBytes(32).toString('hex');

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.append('response_type', 'code');
  googleAuthUrl.searchParams.append('client_id', process.env.CLIENT_ID!);
  googleAuthUrl.searchParams.append('redirect_uri', process.env.GOOGLE_REDIRECT_URI!);
  googleAuthUrl.searchParams.append('scope', 'openid email profile');
  googleAuthUrl.searchParams.append('state', state);
  googleAuthUrl.searchParams.append('prompt', 'consent');

  return { state, googleAuthUrl: googleAuthUrl.toString() };
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
  const googleTokens = await getGoogleTokens(code);
  const decodedJWTPayload = jwtDecode<GoogleJWTPayload>(googleTokens.id_token);
  if (!decodedJWTPayload.email_verified) throw new HttpError(403, 'Email should be verified');

  const dbUser = await UserRepo.findUserByEmail(decodedJWTPayload.email);
  const user =
    dbUser ??
    (await UserRepo.createGoogleUser({
      firstName: decodedJWTPayload.given_name,
      lastName: decodedJWTPayload.family_name,
      email: decodedJWTPayload.email,
      googleId: decodedJWTPayload.sub!,
      role: 'student', // Fix so that users who use OAuth2 don't have a role
    }));

  if (!user.googleId) {
    await UserRepo.updateUserGoogleId(decodedJWTPayload.sub!, user.id);
  }

  const { accessToken, refreshToken } = signTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

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
