import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/HttpError.js';

function isHttpError(err: any): err is HttpError {
  return err !== null && typeof err === 'object' && typeof err.statusCode === 'number';
}

export function globalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  let statusCode = 500;
  let message = 'Internal server error!';

  if (isHttpError(err)) {
    statusCode = err.statusCode;
    message = err.message;
  }

  res.status(statusCode).json({
    message,
  });
}
