import type { Request, Response } from 'express';
import type {
  LoginInput,
  LoginResponseDTO,
  RegisterInput,
  RegisterResponseDTO,
} from '@repo/shared';
import * as authService from './auth.service.js';
import { deleteJWTCookie, setJWTCookie } from './utils/index.js';
import type {
  OAuthQueryString,
  ResendVerificationBody,
  VerifyEmailQueryString,
} from './auth.schemas.js';
import { AppError } from '../../errors/AppError.js';
import type { ErrorCode } from '@repo/shared';

const ACCESS_TOKEN_EXPIRES_AT = 15 * 60 * 1000;
const REFRESH_TOKEN_EXPIRES_AT = 15 * 24 * 60 * 60 * 1000;

function buildErrorUrl(baseUrl: string, error: ErrorCode) {
  const url = new URL(baseUrl);

  url.searchParams.append('error', error);

  return url.toString();
}

export async function register(
  req: Request<unknown, unknown, RegisterInput>,
  res: Response<RegisterResponseDTO>,
) {
  const user = await authService.register(req.body);

  res.status(201).json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
  });
}

export async function login(
  req: Request<unknown, unknown, LoginInput>,
  res: Response<LoginResponseDTO>,
) {
  const { accessToken, refreshToken, user } = await authService.login(req.body);

  setJWTCookie(res, 'accessToken', accessToken, ACCESS_TOKEN_EXPIRES_AT);

  setJWTCookie(res, 'refreshToken', refreshToken, REFRESH_TOKEN_EXPIRES_AT);

  res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
  });
}

export async function refresh(req: Request, res: Response) {
  const raw = req.cookies.refreshToken;
  const refreshToken = typeof raw === 'string' ? raw : undefined;

  try {
    const { newAccessToken, newRefreshToken } = await authService.refresh(refreshToken);

    setJWTCookie(res, 'accessToken', newAccessToken, ACCESS_TOKEN_EXPIRES_AT);

    setJWTCookie(res, 'refreshToken', newRefreshToken, REFRESH_TOKEN_EXPIRES_AT);

    res.json({ message: 'Refreshed' });
  } catch (err) {
    deleteJWTCookie(res, 'accessToken');
    deleteJWTCookie(res, 'refreshToken');

    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  const raw = req.cookies.refreshToken;
  const refreshToken = typeof raw === 'string' ? raw : undefined;

  deleteJWTCookie(res, 'refreshToken');
  deleteJWTCookie(res, 'accessToken');

  await authService.logout(refreshToken);

  res.sendStatus(200);
}

export async function google(req: Request, res: Response) {
  const { googleAuthUrl, state } = authService.google();

  res.cookie('google-oauth-state', state, {
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.redirect(googleAuthUrl);
}

export async function googleCallback(req: Request, res: Response) {
  const { code, state: queryState, error } = req.validatedQuery as OAuthQueryString;
  if (error) {
    if (error === 'access_denied') {
      return res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, 'CANCELED_AUTH'));
    } else return res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, 'SERVER_ERROR'));
  }

  const cookieState = req.cookies['google-oauth-state'] as string | undefined;

  if (!cookieState || !queryState || cookieState !== queryState) {
    return res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, 'INVALID_STATE'));
  }

  res.clearCookie('google-oauth-state', {
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  if (!code) {
    return res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, 'INVALID_GRANT'));
  }

  try {
    const { accessToken, refreshToken } = await authService.handleGoogleCallback(code);

    setJWTCookie(res, 'accessToken', accessToken, ACCESS_TOKEN_EXPIRES_AT);
    setJWTCookie(res, 'refreshToken', refreshToken, REFRESH_TOKEN_EXPIRES_AT);

    res.redirect(process.env.FRONTEND_URL!);
  } catch (err) {
    if (err instanceof AppError) {
      return res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, err.errorCode));
    }
    console.error(err);
    res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, 'SERVER_ERROR'));
  }
}

export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.validatedQuery as VerifyEmailQueryString;

  try {
    await authService.verifyEmail(token);

    res.redirect(process.env.FRONTEND_URL!);
  } catch (err) {
    if (err instanceof AppError) {
      return res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, err.errorCode));
    }
    console.error(err);
    res.redirect(buildErrorUrl(process.env.FRONTEND_URL!, 'SERVER_ERROR'));
  }
}

export async function resendVerification(
  req: Request<unknown, unknown, ResendVerificationBody>,
  res: Response,
) {
  const message = await authService.resendVerification(req.body.email);

  res.json({ message });
}

export async function sendResetPassword(req: Request, res: Response) {
  await authService.sendResetPassword();

  res.json({ message: 'Confirmation link has been sent' });
}
