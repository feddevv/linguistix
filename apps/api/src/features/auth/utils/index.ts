export * from './cookies.js';
export * from './hashing.js';

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
