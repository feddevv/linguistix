import express, { json, type Express } from 'express';
import { router as authRouter } from './auth/auth.route.js';
import { globalErrorHandler } from './middlewares/errors.js';

export const app: Express = express();

// Middlewares
app.use(json());

// Routers
app.use('/api', authRouter);

// Global Error Handler
app.use(globalErrorHandler);
