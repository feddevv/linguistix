import 'express';

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: Record<string, any>;
    }
  }
}
