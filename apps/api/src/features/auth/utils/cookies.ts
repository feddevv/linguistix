import type { Response } from 'express';

export function setJWTCookie(res: Response, name: string, value: unknown, maxAge: number) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  });
}

export function deleteJWTCookie(res: Response, name: string) {
  res.clearCookie(name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}
