import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { type ParsedQs } from 'qs';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
}

function isParseQs(data: unknown): data is ParsedQs {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const result = schemas.query.parse(req.query);
        if (isParseQs(result)) {
          req.query = result;
        }
      }

      next();
    } catch (err) {
      throw err;
    }
  };
}
