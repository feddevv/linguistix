import type { Request, Response } from 'express';
import type {
  LoginInput,
  LoginResponseDTO,
  RegisterInput,
  RegisterResponseDTO,
} from '@repo/shared';
import * as authService from './auth.service.js';

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
  const data = await authService.login(req.body);

  res.cookie('accessToken', data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('refreshToken', data.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 24 * 60 * 60 * 1000,
  });

  res.json({
    user: {
      id: data.user.id,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      email: data.user.email,
      role: data.user.role,
    },
  });
}
