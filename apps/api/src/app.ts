import express, { json, type Express } from 'express';
import { router as authRouter } from './auth/auth.route.js';

export const app: Express = express();

// Middlewares
app.use(json());

app.use('/api', authRouter);

app.use((err, req, res, next) => {
  res.json(err);
});
