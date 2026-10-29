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
  type ResendVerificationBody,
} from './auth.schemas.js';
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../../lib/redis.js';

export const router: Router = Router();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { errorCode: 'REQUEST_LIMIT', message: 'Too many requests' },
  store: new RedisStore({
    prefix: 'rl:auth:login:',
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
});

const resendVerificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { errorCode: 'REQUEST_LIMIT', message: 'Too many requests' },
  store: new RedisStore({
    prefix: 'rl:auth:resendVerification:',
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
});

async function checkEmailCooldown(
  req: Request<unknown, unknown, ResendVerificationBody>,
  res: Response,
  next: NextFunction,
) {
  const key = `cooldown:${req.body.email}:send_email`;
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
}

router.post('/auth/register', validate({ body: registerSchema }), authController.register);
router.post('/auth/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);
router.get('/auth/google', authController.google);
router.get(
  '/auth/google/callback',
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
  validate({ body: resendVerificationSchema }),
  checkEmailCooldown,
  resendVerificationLimiter,
  authController.resendVerification,
);

router.post(
  '/auth/forgot-password',
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);

router.post(
  '/auth/reset-password',
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);
