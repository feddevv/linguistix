import type { Request, Response } from 'express';
import type {
  LoginInput,
  LoginResponseDTO,
  RegisterInput,
  RegisterResponseDTO,
} from '@repo/shared';
import * as authService from './auth.service.js';
import { deleteJWTCookie, setJWTCookie } from './utils/cookies.js';

const ACCESS_TOKEN_EXPIRES_AT = 15 * 60 * 1000;
const REFRESH_TOKEN_EXPIRES_AT = 15 * 24 * 60 * 60 * 1000;

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

export async function googleCallback(req: Request, res: Response) {
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=493460302598-vfts1nfs6s7os5hjribf2fpb8hu7ra98.apps.googleusercontent.com&redirect_uri=http://localhost:3000/api/auth/google/callback&response_type=code&access_type=offline&scope=openid profile email&prompt=consent`;

  const { accessToken, refreshToken } = await authService.handleGoogleCallback(
    req.query.code as string,
  );

  setJWTCookie(res, 'accessToken', accessToken, ACCESS_TOKEN_EXPIRES_AT);
  setJWTCookie(res, 'refreshToken', refreshToken, REFRESH_TOKEN_EXPIRES_AT);

  res.sendStatus(302);
}
