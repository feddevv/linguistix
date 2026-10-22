import { Router } from 'express';
import * as authController from './auth.controller.js';
import { validate } from '../../middlewares/validator.js';
import { loginSchema, registerSchema } from '@repo/shared';
import { oauthSchema, resendVerificationSchema, verifyEmailSchema } from './auth.schemas.js';

export const router: Router = Router();

router.post('/auth/register', validate({ body: registerSchema }), authController.register);
router.post('/auth/login', validate({ body: loginSchema }), authController.login);
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
  authController.resendVerification,
);
