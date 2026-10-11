import type { CookieOptions, Response } from 'express';
import { createHash } from 'node:crypto';

export function preparePassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

export function setJWTCookie(res: Response, name: string, value: unknown, maxAge: number) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  });
}
