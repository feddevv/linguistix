import type { ErrorCode } from '@repo/shared';

export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  SERVER_ERROR: 500,
  EMAIL_IN_USE: 409,
  INVALID_CREDENTIALS: 401,
  TOKEN_NOT_FOUND: 401,
  INVALID_TOKEN: 401,
  INVALID_VERIFICATION_TOKEN: 400,
  USER_NOT_FOUND: 404,
  EMAIL_UNVERIFIED: 403,
  ACCOUNT_IN_USE: 409,
  CANCELED_AUTH: 400,
  INVALID_STATE: 400,
  INVALID_GRANT: 400,
  VALIDATION_ERROR: 422,
  EMAIL_ALREADY_VERIFIED: 409,
};

export class AppError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly statusCode: number;

  constructor(errorCode: ErrorCode, message: string, statusCode = ERROR_STATUS_MAP[errorCode]) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
