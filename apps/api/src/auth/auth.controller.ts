import type { Request, Response } from 'express';
import type {
  LoginInput,
  LoginResponseDTO,
  RegisterInput,
  RegisterResponseDTO,
} from '@repo/shared';
import * as authService from './auth.service.js';
import { setJWTCookie } from './utils/auth.utils.js';

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

  setJWTCookie(res, 'accessToken', accessToken, 15 * 60 * 1000);

  setJWTCookie(res, 'refreshToken', refreshToken, 15 * 24 * 60 * 60 * 1000);

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
  const refreshToken = req.cookies.refreshToken as string | undefined;

  const { newAccessToken, newRefreshToken } = await authService.refresh(refreshToken);

  setJWTCookie(res, 'accessToken', newAccessToken, 15 * 60 * 1000);

  setJWTCookie(res, 'refreshToken', newRefreshToken, 15 * 24 * 60 * 60 * 1000);

  res.json({ message: 'Refreshed' });
}
