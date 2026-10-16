export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class AppError extends Error {
  public readonly errorCode: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(errorCode: string, statusCode: number, message: string, details: unknown) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}
