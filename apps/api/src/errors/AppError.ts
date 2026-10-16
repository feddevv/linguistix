export type ErrorCode =
  | 'SERVER_ERROR'
  | 'EMAIL_IN_USE'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'USER_NOT_FOUND'
  | 'EMAIL_UNVERIFIED'
  | 'ACCOUNT_IN_USE'
  | 'CANCELED_AUTH'
  | 'INVALID_STATE'
  | 'INVALID_GRANT'
  | 'VALIDATION_ERROR';

export class AppError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(errorCode: ErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}
