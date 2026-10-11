import { createHash } from 'node:crypto';

export function preparePassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}
