import 'express';

// Remove any
declare global {
  namespace Express {
    interface Request {
      validatedQuery?: Record<string, any>;
    }
  }
}
