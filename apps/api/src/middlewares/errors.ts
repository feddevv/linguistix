import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/HttpError.js';
import { ZodError } from 'zod';

function isHttpError(err: any): err is HttpError {
  return err !== null && typeof err === 'object' && typeof err.statusCode === 'number';
}

export function globalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error!';

  if (isHttpError(err)) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = err.issues[0]?.message || 'Validation error';
  }

  res.status(statusCode).json({
    message,
  });
}
