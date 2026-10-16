import { expect } from 'vitest';
import { getCookie } from './utils.js';
import type { Response } from 'supertest';

export function expectAuthCookiesCleared(res: Response) {
  for (const name of ['accessToken', 'refreshToken']) {
    const cookie = getCookie(res, name);

    expect(cookie, `${name} cookie should be cleared`).toBeDefined();
    expect(cookie!.value).toBe('');
    expect(cookie!.attrs.has('httponly')).toBe(true);
    expect(cookie!.attrs.get('samesite')?.toLowerCase()).toBe('lax');

    const expires = cookie!.attrs.get('expires');
    const maxAge = cookie!.attrs.get('max-age');
    const isExpired =
      (expires !== undefined && new Date(expires).getTime() <= Date.now()) ||
      (maxAge !== undefined && Number(maxAge) <= 0);
    expect(isExpired).toBe(true);
  }
}

export function expectErrorBody(body: unknown, message?: string) {
  expect(body).toMatchObject({ message: message ?? expect.any(String) });
}

export function expectNoAuthCookies(res: Response) {
  expect(getCookie(res, 'accessToken')).toBeUndefined();
  expect(getCookie(res, 'refreshToken')).toBeUndefined();
}
