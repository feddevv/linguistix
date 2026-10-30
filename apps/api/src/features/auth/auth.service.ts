import { RefreshTokenRepo, VerificationTokenRepo } from './auth.repository.js';
import type { LoginInput, RegisterInput } from '@repo/shared';
import { compare, hash } from 'bcrypt';
import { AppError } from '../../errors/AppError.js';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { UserRepo } from '../user/user.repository.js';
import { jwtDecode } from 'jwt-decode';
import { getGoogleTokens } from './google.service.js';
import crypto from 'crypto';
import { pg } from '../../lib/pg.js';
import { daysFromNow, hashString } from './utils/index.js';
import { emailQueue } from '../../jobs/queues/email.queue.js';

function issueRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function issueSession(user: JwtPayload, secretKey = process.env.SECRET_KEY!) {
  const accessToken = jwt.sign({ ...user, jti: crypto.randomUUID() }, secretKey, {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign({ jti: crypto.randomUUID() }, secretKey, {
    expiresIn: '15d',
  });

  const hashedRefreshToken = hashString(refreshToken);

  const date = daysFromNow(15);

  return { accessToken, refreshToken, hashedRefreshToken, date };
}

export async function register({ firstName, lastName, password, email, role }: RegisterInput) {
  const sha256hash = hashString(password);
  const passwordHash = await hash(sha256hash, 10);

  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    const user = await UserRepo.create({
      firstName,
      lastName,
      password: passwordHash,
      email,
      role,
      isVerified: false,
      client,
    });

    const verificationToken = issueRandomToken();

    await VerificationTokenRepo.create({
      tokenHash: hashString(verificationToken),
      subject: 'email',
      userId: user.id,
    });

    await client.query('COMMIT');

    await emailQueue.add('email-verification', { email: user.email, verificationToken });

    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function login({ email, password }: LoginInput) {
  const user = await UserRepo.findUserByEmail(email);

  if (!user) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect');

  const sha256hash = hashString(password);
  if (!user.password) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect');
  const isMatch = await compare(sha256hash, user.password);

  if (!isMatch) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect');

  const { accessToken, refreshToken, hashedRefreshToken, date } = issueSession({
    id: user.id,
    email: user.email,
    role: user.role,
  });

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
  if (!refreshToken) throw new AppError('TOKEN_NOT_FOUND', 'Refresh token is not attached');

  try {
    jwt.verify(refreshToken, process.env.SECRET_KEY!);
  } catch {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired token');
  }

  const hashedRefreshToken = hashString(refreshToken);
  const dbToken = await RefreshTokenRepo.findRefreshTokenByHash(hashedRefreshToken);

  if (!dbToken) throw new AppError('INVALID_TOKEN', 'Invalid or expired token');

  const user = await UserRepo.findUserById(dbToken.userId);

  if (!user) throw new AppError('USER_NOT_FOUND', "Current user doesn't exist");

  const {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    hashedRefreshToken: hashedNewRefreshToken,
    date: newExpiresAt,
  } = issueSession({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const updated = await RefreshTokenRepo.updateRefreshToken(
    hashedRefreshToken,
    hashedNewRefreshToken,
    newExpiresAt,
  );

  if (!updated || updated < 1) throw new AppError('INVALID_TOKEN', 'Invalid or expired token');

  return { newAccessToken, newRefreshToken };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;

  const hashedRefreshToken = hashString(refreshToken);
  await RefreshTokenRepo.deleteRefreshToken(hashedRefreshToken);
}

export function google() {
  const state = issueRandomToken();

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.append('response_type', 'code');
  googleAuthUrl.searchParams.append('client_id', process.env.GOOGLE_CLIENT_ID!);
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
  if (!decodedJWTPayload.email_verified)
    throw new AppError('EMAIL_UNVERIFIED', 'Email should be verified');

  const userByGoogleId = await UserRepo.findUserByGoogleId(decodedJWTPayload.sub!);
  const userByEmail = await UserRepo.findUserByEmail(decodedJWTPayload.email);
  let user = userByGoogleId ?? userByEmail;

  if (!user) {
    user = await UserRepo.create({
      email: decodedJWTPayload.email,
      firstName: decodedJWTPayload.given_name ?? decodedJWTPayload.name,
      lastName: decodedJWTPayload.family_name ?? '',
      googleId: decodedJWTPayload.sub!,
      role: null,
      isVerified: true,
    });
  } else if (!user.googleId || user.googleId !== decodedJWTPayload.sub!) {
    throw new AppError(
      'EMAIL_IN_USE',
      'An account with this email already exists. Please sign in with your email and password.',
    );
  }

  if (user.googleId === decodedJWTPayload.sub! && user.email !== decodedJWTPayload.email) {
    const existingUser = await UserRepo.findUserByEmail(decodedJWTPayload.email);

    if (existingUser) {
      throw new AppError('EMAIL_IN_USE', 'This Google email is already used by another account');
    }
    await UserRepo.updateUserEmail(decodedJWTPayload.email, user.id);
  }

  const { accessToken, refreshToken, hashedRefreshToken, date } = issueSession({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  await RefreshTokenRepo.createRefreshToken({
    refreshTokenHash: hashedRefreshToken,
    userId: user.id,
    expiresAt: date,
  });

  return {
    accessToken,
    refreshToken,
  };
}

export async function verifyEmail(token: string) {
  const hashedToken = hashString(token);

  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    const consumed = await VerificationTokenRepo.consume(hashedToken, 'email');

    if (!consumed)
      throw new AppError(
        'INVALID_VERIFICATION_TOKEN',
        'Provided email verification token is invalid or has expired',
      );
    else {
      const user = await UserRepo.findUserById(consumed);

      if (!user) throw new AppError('USER_NOT_FOUND', "This user doesn't exist");
      else if (user.isVerified)
        throw new AppError('EMAIL_ALREADY_VERIFIED', 'This email is already verified');
    }

    await UserRepo.updateIsVerified(true, consumed, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function resendVerification(email: string) {
  const user = await UserRepo.findUserByEmail(email);

  if (!user) return;
  else if (user?.isVerified) return;

  const verificationToken = issueRandomToken();

  await VerificationTokenRepo.create({
    tokenHash: hashString(verificationToken),
    subject: 'email',
    userId: user.id,
  });

  await emailQueue.add('email-verification', { email: user.email, verificationToken });
}

export async function forgotPassword(email: string) {
  const user = await UserRepo.findUserByEmail(email);

  if (!user) return;
  else if (!user.isVerified) return;

  const verificationToken = issueRandomToken();

  await VerificationTokenRepo.create({
    tokenHash: hashString(verificationToken),
    subject: 'reset-password',
    userId: user.id,
  });

  await emailQueue.add('reset-password', { email: user.email, verificationToken });
}

export async function resetPassword(verificationToken: string, newPassword: string) {
  const hashedToken = hashString(verificationToken);

  const client = await pg.connect();

  try {
    await client.query('BEGIN');

    const consumed = await VerificationTokenRepo.consume(hashedToken, 'reset-password');

    if (!consumed)
      throw new AppError('INVALID_VERIFICATION_TOKEN', 'Invalid or expired verification token');

    const sha256hash = hashString(newPassword);
    const hashedPassword = await hash(sha256hash, 10);
    const updated = await UserRepo.updatePassword(consumed, hashedPassword, client);

    if (!updated) throw new AppError('USER_NOT_FOUND', "This user doesn't exist");

    await RefreshTokenRepo.revoke(consumed);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
