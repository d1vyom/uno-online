import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[Error] ${err.name}: ${err.message}`);
  
  if (env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  res.status(500).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};
