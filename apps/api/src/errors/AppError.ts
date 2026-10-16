import type { ErrorCode } from '@repo/shared';

export class AppError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly statusCode: number;

  constructor(errorCode: ErrorCode, statusCode: number, message: string) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
