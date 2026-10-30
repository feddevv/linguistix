import { Router, type NextFunction, type Request, type Response } from 'express';
import * as authController from './auth.controller.js';
import { validate } from '../../middlewares/validator.js';
import { loginSchema, registerSchema } from '@repo/shared';
import {
  forgotPasswordSchema,
  oauthSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas.js';
import { redisClient } from '../../lib/redis.js';
import { authLimiter, strictLimiter } from './auth.limiters.js';

export const router: Router = Router();

function checkCooldown(subject: string) {
  return async (
    req: Request<unknown, unknown, { email: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    const key = `cooldown:${req.body.email}:${subject}`;
    const acquired = await redisClient.SET(key, '1', {
      condition: 'NX',
      expiration: { type: 'EX', value: 60 },
    });
    if (!acquired) {
      const ttl = await redisClient.TTL(key);
      return res.status(429).json({
        errorCode: 'COOLDOWN',
        message: 'Too many requests. Please try again later.',
        retryAfter: ttl,
      });
    }

    next();
  };
}

router.post(
  '/auth/register',
  authLimiter,
  validate({ body: registerSchema }),
  authController.register,
);
router.post('/auth/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);
router.get('/auth/google', authController.google);
router.get(
  '/auth/google/callback',
  authLimiter,
  validate({ query: oauthSchema }),
  authController.googleCallback,
);
router.get(
  '/auth/verify-email',
  validate({ query: verifyEmailSchema }),
  authController.verifyEmail,
);

router.post(
  '/auth/resend-verification',
  checkCooldown('resend-email-verification'),
  strictLimiter,
  validate({ body: resendVerificationSchema }),
  authController.resendVerification,
);

router.post(
  '/auth/forgot-password',
  checkCooldown('reset-password'),
  strictLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);

router.post(
  '/auth/reset-password',
  strictLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);
