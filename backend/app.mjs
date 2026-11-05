import express from 'express';
import cors from 'cors';
import { ApiError } from './driveService.mjs';

export function createApp({ service, verifyUser, allowedOrigins }) {
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
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    }),
  );
  app.use(express.json({ limit: '8kb' }));
  app.use('/api/drive', async (req, res, next) => {
    if (req.get('x-requested-with') !== 'XMLHttpRequest') throw new ApiError(403, 'csrf_denied');
    const bearer = req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!bearer) throw new ApiError(401, 'unauthorized');
    let user;
    try {
      user = await verifyUser(bearer);
    } catch {
      throw new ApiError(401, 'unauthorized');
    }
    if (!user?.uid || !user.email || !user.email_verified) throw new ApiError(401, 'unauthorized');
    if (!user.enabled) throw new ApiError(403, 'forbidden');
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
        : new ApiError(
            error?.type === 'entity.parse.failed' ? 400 : 503,
            error?.type === 'entity.parse.failed' ? 'invalid_request' : 'service_unavailable',
          );
    res.status(safe.status).json({ error: safe.code });
  });
  return app;
}
