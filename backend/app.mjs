import express from 'express';
import cors from 'cors';
import { ApiError } from './driveService.mjs';

export function createApp({
  service,
  verifyUser,
  allowedOrigins,
  now = Date.now,
  requestBudget = { limit: 60, windowMs: 60000, capacity: 1000 },
}) {
  if (
    ![requestBudget.limit, requestBudget.windowMs, requestBudget.capacity].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw Error('Invalid request budget');
  const budgets = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'construction-ops-backend' }));
  app.use('/api/drive', (req, _res, next) => {
    if (!allowedOrigins.includes(req.get('origin')))
      return next(new ApiError(403, 'origin_denied'));
    next();
  });
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-Company-ID'],
    }),
  );
  app.use(express.json({ limit: '8kb' }));
  app.use('/api/drive', async (req, res, next) => {
    if (req.get('x-requested-with') !== 'XMLHttpRequest') throw new ApiError(403, 'csrf_denied');
    const bearer = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!bearer) throw new ApiError(401, 'unauthorized');
    let user;
    try {
      user = await verifyUser(bearer, req.get('x-company-id'));
    } catch {
      throw new ApiError(401, 'unauthorized');
    }
    if (!user?.uid || !user.email || !user.email_verified) throw new ApiError(401, 'unauthorized');
    if (!user.enabled) throw new ApiError(403, 'forbidden');
    const timestamp = now();
    for (const [uid, budget] of budgets) if (budget.resetAt <= timestamp) budgets.delete(uid);
    const budget = budgets.get(user.uid);
    if (
      (budget && budget.count >= requestBudget.limit) ||
      (!budget && budgets.size >= requestBudget.capacity)
    ) {
      res.set(
        'Retry-After',
        String(
          Math.max(
            1,
            Math.ceil(((budget?.resetAt ?? timestamp + requestBudget.windowMs) - timestamp) / 1000),
          ),
        ),
      );
      throw new ApiError(429, 'rate_limited');
    }
    budgets.set(
      user.uid,
      budget
        ? { ...budget, count: budget.count + 1 }
        : { count: 1, resetAt: timestamp + requestBudget.windowMs },
    );
    res.locals.user = user;
    next();
  });
  app.post('/api/drive/exchange', async (req, res) => {
    if (typeof req.body?.code !== 'string' || !req.body.code.trim() || req.body.code.length > 4096)
      throw new ApiError(400, 'invalid_request');
    res.json(await service.exchange(res.locals.user, req.body.code, req.get('origin')));
  });
  app.post('/api/drive/session', async (req, res) => {
    res.json(await service.session(res.locals.user, req.body?.force === true));
  });
  app.delete('/api/drive/connection', async (_req, res) => {
    await service.disconnect(res.locals.user);
    res.status(204).end();
  });
  app.use((_req, _res, next) => next(new ApiError(404, 'not_found')));
  app.use((error, _req, res, _next) => {
    const safe =
      error instanceof ApiError
        ? error
        : error?.type === 'entity.too.large'
          ? new ApiError(413, 'payload_too_large')
          : new ApiError(
              error?.type === 'entity.parse.failed' ? 400 : 503,
              error?.type === 'entity.parse.failed' ? 'invalid_request' : 'service_unavailable',
            );
    res.status(safe.status).json({ error: safe.code });
  });
  return app;
}
