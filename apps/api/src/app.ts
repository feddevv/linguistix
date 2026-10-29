import express, { json, type Express } from 'express';
import { router as authRouter } from './features/auth/auth.route.js';
import { globalErrorHandler } from './middlewares/errors.js';
import swaggerUi from 'swagger-ui-express';
import fs from 'node:fs';
import YAML from 'yaml';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from './lib/redis.js';

export const app: Express = express();

// Middlewares
app.use(json());
app.use(cookieParser());

app.set('trust proxy', 1);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { errorCode: 'REQUEST_LIMIT', message: 'Too many requests' },
  store: new RedisStore({
    prefix: 'rl:global:',
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
});
app.use(limiter);

// Swagger UI
if (process.env.NODE_ENV === 'dev') {
  const filePath = path.resolve(process.cwd(), 'docs/api/openapi.yaml');
  const spec = fs.readFileSync(filePath, 'utf-8');
  const parsedSpec = YAML.parse(spec);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(parsedSpec));
}

// Routers
app.use('/api', authRouter);

// Global Error Handler
app.use(globalErrorHandler);
