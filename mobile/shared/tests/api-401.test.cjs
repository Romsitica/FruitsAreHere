/**
 * 共享层回归测试：401 竞态（S01）
 *
 * 场景：账号 A 的请求还没返回就切换成账号 B，A 的旧请求随后返回 401。
 * 修复前共享层会直接清空「当前」令牌，把 B 踢下线。
 *
 * 运行：node --test mobile/shared/tests/
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadApi() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  const store = new Map();
  const pending = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URLSearchParams,
    JSON,
    document: {
      createElement: () => ({ classList: { add() {} }, style: {}, appendChild() {} }),
      body: { appendChild() {} },
      getElementById: () => null,
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    location: { search: '', hash: '' },
    Vue: { reactive: (obj) => obj },
    fetch: (url, options) =>
      new Promise((resolve) => pending.push({ url, options, resolve })),
  };
  sandbox.window = sandbox;
  sandbox.window.fetch = sandbox.fetch;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { sandbox, pending };
}

function unauthorized() {
  return { status: 401, ok: false, json: async () => ({ ok: false, error: '请先登录' }) };
}

function okBody(payload) {
  return { status: 200, ok: true, json: async () => ({ ok: true, ...payload }) };
}

test('旧账号迟到的 401 不会清除新账号的登录态', async () => {
  const { sandbox, pending } = loadApi();
  const client = sandbox.FM.createClient({ baseUrl: '/api' });

  client.saveToken('A');
  client.state.user = { id: 1, phone: 'A' };

  const inflight = client.get('/orders');
  assert.equal(pending.length, 1, '请求应该已经发出');
  assert.equal(pending[0].options.headers.Authorization, 'Bearer A');

  // 期间切换成账号 B
  client.saveToken('B');
  client.state.user = { id: 2, phone: 'B' };

  // A 的旧请求这时候才返回 401
  pending[0].resolve(unauthorized());
  await assert.rejects(inflight);

  assert.equal(client.state.token, 'B', 'B 的令牌必须保留');
  assert.deepEqual(client.state.user, { id: 2, phone: 'B' }, 'B 的用户信息必须保留');
});

test('令牌未变时的 401 仍然清除登录态', async () => {
  const { sandbox, pending } = loadApi();
  const client = sandbox.FM.createClient({ baseUrl: '/api' });

  client.saveToken('B');
  client.state.user = { id: 2 };

  const inflight = client.get('/auth/me');
  pending[0].resolve(unauthorized());
  await assert.rejects(inflight);

  assert.equal(client.state.token, '', '令牌确实过期时应当清空');
  assert.equal(client.state.user, null);
});

test('并发请求中只有属于当前令牌的 401 才清登录态', async () => {
  const { sandbox, pending } = loadApi();
  const client = sandbox.FM.createClient({ baseUrl: '/api' });

  client.saveToken('A');
  client.state.user = { id: 1 };
  const first = client.get('/orders');

  client.saveToken('B');
  client.state.user = { id: 2 };
  const second = client.get('/auth/me');

  // 先回来的旧账号请求不应影响 B；随后 B 自己的 401 才清空
  pending[0].resolve(unauthorized());
  await assert.rejects(first);
  assert.equal(client.state.token, 'B');

  pending[1].resolve(unauthorized());
  await assert.rejects(second);
  assert.equal(client.state.token, '');
});

test('普通业务错误不误清登录态', async () => {
  const { sandbox, pending } = loadApi();
  const client = sandbox.FM.createClient({ baseUrl: '/api' });

  client.saveToken('B');
  client.state.user = { id: 2 };
  const inflight = client.post('/orders', { quantity: 1.5 });
  pending[0].resolve({
    status: 400,
    ok: false,
    json: async () => ({ ok: false, error: '参数 quantity 需为整数' }),
  });
  await assert.rejects(inflight);
  assert.equal(client.state.token, 'B');
});

test('抛出的错误对象携带 HTTP 状态，便于上层区分 401 与业务错误', async () => {
  const { sandbox, pending } = loadApi();
  const client = sandbox.FM.createClient({ baseUrl: '/api' });
  client.saveToken('B');
  const inflight = client.post('/orders', { quantity: 1.5 });
  pending[0].resolve({
    status: 400,
    ok: false,
    json: async () => ({ ok: false, error: '参数 quantity 需为整数' }),
  });
  await assert.rejects(inflight, (err) => err.status === 400);
});

test('登录成功后令牌被写入并可用于后续请求', async () => {
  const { sandbox, pending } = loadApi();
  const client = sandbox.FM.createClient({ baseUrl: '/api' });

  const login = client.login('13900000001', '123456');
  pending[0].resolve(okBody({ token: 'T1', user: { id: 9 } }));
  await login;
  assert.equal(client.state.token, 'T1');

  client.get('/auth/me');
  assert.equal(pending[1].options.headers.Authorization, 'Bearer T1');
  pending[1].resolve(okBody({ user: { id: 9 } }));
});
