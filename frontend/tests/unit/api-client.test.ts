import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { ApiError, SessionChangedError, apiFetch } from '../../src/api/client';
import { invalidateSession, setAccessToken } from '../../src/api/session-store';
import { FALLBACK_MESSAGE, OFFLINE_MESSAGE } from '../../src/i18n/errors';

afterEach(() => setAccessToken(null));

describe('apiFetch — capa api (FR-004/005/015/027/029)', () => {
  it('adjunta Authorization desde memoria', async () => {
    setAccessToken('tok-123');
    let seen: string | null = null;
    server.use(
      http.get('/v1/orders', ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ orders: [] });
      }),
    );
    await apiFetch('/v1/orders');
    expect(seen).toBe('Bearer tok-123');
  });

  it('en 401 renueva vía refresh (una vez) y reintenta la petición original', async () => {
    setAccessToken('expired');
    let orderCalls = 0;
    let refreshCalls = 0;
    server.use(
      http.get('/v1/orders', () => {
        orderCalls += 1;
        return orderCalls === 1
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ orders: [] });
      }),
      http.post('/v1/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json({ access_token: 'fresh' });
      }),
    );
    const res = await apiFetch<{ orders: unknown[] }>('/v1/orders');
    expect(res.orders).toEqual([]);
    expect(refreshCalls).toBe(1);
    expect(orderCalls).toBe(2);
  });

  it('deduplica refresh concurrente en una sola llamada (single-use)', async () => {
    setAccessToken('expired');
    let refreshCalls = 0;
    server.use(
      http.get('/v1/orders', () => new HttpResponse(null, { status: 401 })),
      http.get('/v1/orders/:id', () => new HttpResponse(null, { status: 401 })),
      http.post('/v1/auth/refresh', () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 401 }); // refresh falla → ambas van a login
      }),
    );
    const a = apiFetch('/v1/orders').catch((e) => e);
    const b = apiFetch('/v1/orders/x').catch((e) => e);
    const [ra, rb] = await Promise.all([a, b]);
    // Ambas terminan (sin resolver): la 1ª como 401→invalida sesión; la 2ª ve el cambio de epoch.
    expect(ra === null || ra instanceof ApiError || ra instanceof SessionChangedError).toBe(true);
    expect(rb === null || rb instanceof ApiError || rb instanceof SessionChangedError).toBe(true);
    expect(refreshCalls).toBe(1); // una sola renovación compartida (dedup)
  });

  it('mapea el code del error del contrato a mensaje; code no mapeado → fallback', async () => {
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ code: 'WEIRD_UNKNOWN', message: 'x' }, { status: 500 }),
      ),
    );
    const err = (await apiFetch('/v1/orders').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.userMessage).toBe(FALLBACK_MESSAGE);
  });

  it('sin respuesta HTTP (red) → mensaje offline', async () => {
    server.use(http.get('/v1/orders', () => HttpResponse.error()));
    const err = (await apiFetch('/v1/orders').catch((e) => e)) as ApiError;
    expect(err.userMessage).toBe(OFFLINE_MESSAGE);
  });

  it('descarta la respuesta en vuelo si la sesión cambia (logout/cambio de rol)', async () => {
    setAccessToken('tok');
    server.use(
      http.get('/v1/orders', async () => {
        invalidateSession(); // simula logout mientras la petición está en vuelo
        return HttpResponse.json({ orders: [{ leaked: true }] });
      }),
    );
    const err = await apiFetch('/v1/orders').catch((e) => e);
    expect(err).toBeInstanceOf(SessionChangedError);
  });
});
