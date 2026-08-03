import { Request, Response, NextFunction } from 'express';

const ipRequests = new Map<string, { count: number; lastReset: number }>();

// Configurable via environment variables (falls back to dev-friendly defaults)
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10) || 60000;
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '500', 10) || 500;

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const clientInfo = ipRequests.get(ip);

  if (!clientInfo) {
    ipRequests.set(ip, { count: 1, lastReset: now });
    return next();
  }

  if (now - clientInfo.lastReset > WINDOW_MS) {
    clientInfo.count = 1;
    clientInfo.lastReset = now;
    ipRequests.set(ip, clientInfo);
    return next();
  }

  clientInfo.count++;
  ipRequests.set(ip, clientInfo);

  if (clientInfo.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
    });
  }

  next();
};
