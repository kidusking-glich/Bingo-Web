import { Request, Response, NextFunction } from 'express';

const ipRequests = new Map<string, { count: number; lastReset: number }>();

// Reset window of 1 minute (60,000 ms)
const WINDOW_MS = 60000;
// Limit to 100 requests per window
const MAX_REQUESTS = 100;

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
