import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@repo/shared';
import { AppError } from '../errors/AppError.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role | null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const raw: unknown = req.cookies?.accessToken;
  const token = typeof raw === 'string' && raw.length > 0 ? raw : undefined;

  if (!token) throw new AppError('UNAUTHORIZED', 'Authentication required');

  let payload: unknown;
  try {
    payload = jwt.verify(token, process.env.SECRET_KEY!);
  } catch {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired access token');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as { id?: unknown }).id !== 'string' ||
    typeof (payload as { email?: unknown }).email !== 'string'
  ) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired access token');
  }

  const { id, email, role } = payload as AuthUser;
  req.user = { id, email, role: role ?? null };

  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required');

    if (!req.user.role || !roles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', "You don't have permission to perform this action");
    }

    next();
  };
}
