import { Router } from 'express';
import * as authController from './auth.controller.js';

export const router: Router = Router();

router.post('/auth/register', authController.register);
