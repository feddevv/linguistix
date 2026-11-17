import 'express';
import type { AuthUser } from '../middlewares/auth.js';

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
      user?: AuthUser;
    }
  }
}
