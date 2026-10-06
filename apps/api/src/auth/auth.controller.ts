import type { Request, Response } from 'express';
import type { RegisterInput, RegisterResponseDTO } from '@repo/shared';
import * as authService from './auth.service.js';

export async function register(
  req: Request<unknown, unknown, RegisterInput>,
  res: Response<RegisterResponseDTO>,
) {
  const user = await authService.register(req.body);

  res.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  });
}
