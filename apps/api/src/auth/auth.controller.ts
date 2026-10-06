import type { Request, Response } from 'express';
import type { UserInputDTO, UserOutputDTO } from './auth.types.js';
import * as authService from './auth.service.js';

export async function register(
  req: Request<unknown, unknown, UserInputDTO>,
  res: Response<UserOutputDTO>,
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
