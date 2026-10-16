import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { ZodError } from 'zod';
import type { ErrorCode } from '@repo/shared';

export function globalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error!';
  let errorCode: ErrorCode = 'SERVER_ERROR';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorCode = err.errorCode;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = err.issues[0]?.message || 'Validation error';
    errorCode = 'VALIDATION_ERROR';
  } else if (
    err instanceof SyntaxError &&
    'statusCode' in err &&
    typeof err.statusCode === 'number' &&
    err.statusCode === 400
  ) {
    statusCode = err.statusCode;
    errorCode = 'VALIDATION_ERROR';
    message = 'Invalid JSON payload passed';
  } else if (
    err instanceof Error &&
    'statusCode' in err &&
    typeof err.statusCode === 'number' &&
    err.statusCode === 413
  ) {
    statusCode = err.statusCode;
    errorCode = 'VALIDATION_ERROR';
    message = 'Payload too large';
  } else {
    console.error(err);
  }

  res.status(statusCode).json({
    errorCode,
    message,
  });
}
