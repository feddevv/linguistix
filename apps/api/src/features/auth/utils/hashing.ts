import { createHash } from 'node:crypto';

export function hashString(str: string) {
  return createHash('sha256').update(str).digest('hex');
}
