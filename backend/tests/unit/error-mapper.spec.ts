import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { statusFor, jsonErrorHandler } from '../../src/handlers/error-mapper';

describe('error-mapper (FR-013)', () => {
  it('mapea códigos de dominio a HTTP', () => {
    expect(statusFor('INVALID_CREDENTIALS')).toBe(401);
    expect(statusFor('UNAUTHENTICATED')).toBe(401);
    expect(statusFor('CSRF_INVALID')).toBe(403);
    expect(statusFor('FORBIDDEN')).toBe(403);
    expect(statusFor('NOT_FOUND')).toBe(404);
    expect(statusFor('VALIDATION_ERROR')).toBe(422);
    expect(statusFor('RATE_LIMITED')).toBe(429);
    expect(statusFor('SERVICE_UNAVAILABLE')).toBe(503);
  });

  it('should 422 on malformed JSON body (SyntaxError del body-parser, no 400/500)', async () => {
    const app = express();
    app.use(express.json());
    app.post('/x', (_req, res) => {
      res.json({ ok: true });
    });
    app.use(jsonErrorHandler);
    const res = await request(app)
      .post('/x')
      .set('Content-Type', 'application/json')
      .send('{ malformed');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
