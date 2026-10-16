import type { NextFunction, Request, Response } from 'express';
import { AppError, type ErrorCode } from '../errors/HttpError.js';
import { ZodError } from 'zod';

function isAppError(err: any): err is AppError {
  return (
    err !== null &&
    typeof err === 'object' &&
    typeof err.statusCode === 'number' &&
    'errorCode' in err
  );
}

export function globalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error!';
  let errorCode: ErrorCode = 'SERVER_ERROR';

  if (isAppError(err)) {
    statusCode = err.statusCode;
    message = err.message;
    errorCode = err.errorCode;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = err.issues[0]?.message || 'Validation error';
    errorCode = 'VALIDATION_ERROR';
  } else console.error(err);

  res.status(statusCode).json({
    errorCode,
    message,
  });
}
