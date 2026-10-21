// A local stand-in for the slice of the Supabase Auth API Paldora uses, so
// the real web sign-in, the real API verifier, and the real provisioning
// script can run end to end without a hosted project. Test-only: binds to
// loopback, keeps everything in memory, and signs with a fresh ES256 key.
import { createServer } from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';

const port = Number(process.env.FAKE_AUTH_PORT ?? 54399);
const base = `http://127.0.0.1:${port}`;
const issuer = `${base}/auth/v1`;
const serviceRoleKey =
  process.env.FAKE_AUTH_SERVICE_ROLE_KEY ?? 'e2e-service-role-key-not-a-secret';
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const kid = randomUUID();
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid,
  alg: 'ES256',
  use: 'sig',
};

/** id → { user, password } and refresh token → user id. */
const accounts = new Map();
const refreshTokens = new Map();

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function accessToken(user, sessionId) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'ES256', kid, typ: 'JWT' });
  const payload = b64({
    sub: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    iss: issuer,
    email: user.email,
    session_id: sessionId,
    iat: now,
    exp: now + 3600,
  });
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function session(user) {
  const refreshToken = randomUUID();
  refreshTokens.set(refreshToken, user.id);
  return {
    access_token: accessToken(user, randomUUID()),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refreshToken,
    user,
  };
}

function newUser(email) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
  };
}

const findByEmail = (email) =>
  [...accounts.values()].find(
    (entry) => entry.user.email === email.toLowerCase(),
  );

function userFromBearer(request) {
  const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
  try {
    const { sub } = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    );
    return accounts.get(sub);
  } catch {
    return undefined;
  }
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : {};
}

function send(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(payload === undefined ? '' : JSON.stringify(payload));
}

const invalidCredentials = {
  code: 'invalid_credentials',
  error: 'invalid_grant',
  error_description: 'Invalid login credentials',
  msg: 'Invalid login credentials',
};

async function handleToken(url, request, response) {
  const input = await body(request);
  if (url.searchParams.get('grant_type') === 'password') {
    const entry = findByEmail(input.email ?? '');
    if (!entry || entry.password !== input.password)
      return send(response, 400, invalidCredentials);
    return send(response, 200, session(entry.user));
  }
  const userId = refreshTokens.get(input.refresh_token);
  if (!userId)
    return send(response, 400, {
      code: 'refresh_token_not_found',
      msg: 'Invalid Refresh Token',
    });
  refreshTokens.delete(input.refresh_token);
  return send(response, 200, session(accounts.get(userId).user));
}

async function handleAdmin(url, request, response) {
  if (request.headers.authorization !== `Bearer ${serviceRoleKey}`) {
    return send(response, 401, { msg: 'not allowed' });
  }
  const id = url.pathname.split('/admin/users/')[1];
  if (request.method === 'GET' && !id) {
    return send(response, 200, {
      users: [...accounts.values()].map((entry) => entry.user),
      aud: 'authenticated',
    });
  }
  const input = await body(request);
  if (request.method === 'POST') {
    if (findByEmail(input.email))
      return send(response, 422, {
        code: 'email_exists',
        msg: 'already registered',
      });
    const user = newUser(input.email.toLowerCase());
    accounts.set(user.id, { user, password: input.password ?? null });
    return send(response, 200, user);
  }
  const entry = accounts.get(id);
  if (!entry) return send(response, 404, { msg: 'User not found' });
  if (input.password) entry.password = input.password;
  return send(response, 200, entry.user);
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', base);
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  if (url.pathname === '/health') return send(response, 200, { ok: true });
  if (path === '/.well-known/jwks.json')
    return send(response, 200, { keys: [jwk] });
  if (path === '/token' && request.method === 'POST')
    return handleToken(url, request, response);
  if (path === '/logout') return send(response, 204);
  if (path === '/recover') return send(response, 200, {});
  if (path.startsWith('/admin/users'))
    return handleAdmin(url, request, response);
  if (path === '/user') {
    const entry = userFromBearer(request);
    if (!entry)
      return send(response, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
    if (request.method === 'PUT') {
      const input = await body(request);
      if (input.password) entry.password = input.password;
    }
    return send(response, 200, entry.user);
  }
  return send(response, 404, { msg: 'not found' });
}

// Keep the fixture connection alive across browser/a11y pauses rather than
// racing Node fetch's pooled socket against the default five-second close.
createServer({ keepAliveTimeout: 60_000 }, (request, response) => {
  route(request, response).catch(() =>
    send(response, 500, { msg: 'fake auth error' }),
  );
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`fake auth listening on ${base}\n`);
});
