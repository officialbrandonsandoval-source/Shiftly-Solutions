import { Request, Response, NextFunction } from 'express';
import { AppError, ServiceError, SMSError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof SMSError) {
    return res.status(502).json({
      success: false,
      error: 'SMS provider error',
    });
  }

  if (err instanceof ServiceError) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable',
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Don't leak internal errors in production
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

  res.status(500).json({
    success: false,
    error: message,
  });
}
