import express, { json, type Express } from 'express';
import { router as authRouter } from './auth/auth.route.js';
import { globalErrorHandler } from './middlewares/errors.js';
import swaggerUi from 'swagger-ui-express';
import fs from 'node:fs';
import YAML from 'yaml';
import path from 'node:path';
import cookieParser from 'cookie-parser';

export const app: Express = express();

// Middlewares
app.use(json());
app.use(cookieParser());

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
