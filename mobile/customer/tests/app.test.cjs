const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const calls = [];
  const state = { user: null, token: '' };
  const client = { state, get: async () => ({}), post: async (...args) => { calls.push(args); return { order: { id: 9 } }; },
    refreshUser: async () => {}, loadMe: async () => {}, logout: async () => {} };
  const context = vm.createContext({ URLSearchParams, console, Date, setTimeout, clearTimeout, setInterval, clearInterval,
    window: { confirm: () => true, addEventListener() {}, removeEventListener() {}, scrollTo() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    Vue: { reactive: v => v, createApp: () => ({ component() {}, mount() {} }) },
    FM: { createClient: () => client, fmtMoney: v => String(v), toast() {},
      createRouter: () => ({ state: { path: '/', query: {} }, navigate: p => calls.push(p) }) } });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8') +
    '\n;globalThis.subjects = {CtHome, CtDetail, resolve, Alerts, recordOrders, readOrder, loadAccount};', context);
  function instance(component) {
    const instance = component.data();
    for (const [name, method] of Object.entries(component.methods || {})) instance[name] = method.bind(instance);
    for (const [name, getter] of Object.entries(component.computed || {})) Object.defineProperty(instance, name, { get: () => getter.call(instance) });
    return instance;
  }
  return { ...context.subjects, calls, client, state, instance };
}

test('order detail and points ledger routes require authentication', () => {
  const s = setup();
  assert.equal(s.resolve('/orders/9').route.view, 'ct-order-detail');
  assert.equal(s.resolve('/orders/9').route.auth, true);
  assert.equal(s.resolve('/points/logs').route.auth, true);
  assert.equal(s.resolve('/').route.auth, undefined);
});

test('legacy full-list endpoint reveals items in batches without requesting duplicate pages', async () => {
  const s = setup(); let requests = 0;
  s.client.get = async path => path.startsWith('/products')
    ? (requests++, { products: Array.from({ length: 30 }, (_, i) => ({ id: i + 1 })), categories: [] })
    : { announcements: [] };
  const home = s.instance(s.CtHome);
  await home.load();
  assert.equal(home.visibleProducts.length, 12);
  await home.loadMore();
  assert.equal(home.visibleProducts.length, 24);
  await home.loadMore();
  assert.equal(home.visibleProducts.length, 30);
  assert.equal(home.hasMore, false);
  assert.equal(requests, 1);
});

test('late search responses cannot replace newer filter results', async () => {
  const s = setup(); const deferred = [];
  s.client.get = path => path.startsWith('/products')
    ? new Promise(resolve => deferred.push(resolve)) : Promise.resolve({ announcements: [] });
  const home = s.instance(s.CtHome);
  const first = home.load();
  home.keyword = '橙';
  const second = home.load();
  deferred[1]({ products: [{ id: 2 }], categories: [] }); await second;
  deferred[0]({ products: [{ id: 1 }], categories: [] }); await first;
  assert.equal(home.products[0].id, 2);
});

test('invalid quantities cannot submit orders', async () => {
  for (const quantity of [0, -1, 1.5, 11, '', NaN]) {
    const s = setup(); s.state.user = { balanceCents: 999999 };
    const detail = s.instance(s.CtDetail);
    detail.product = { id: 1, stock: 10, priceCents: 100 };
    detail.form.quantity = quantity;
    await detail.submit();
    assert.equal(s.calls.length, 0, 'quantity=' + quantity);
  }
});

test('guest reservation returns to the selected product after login', async () => {
  const s = setup(); const detail = s.instance(s.CtDetail);
  detail.id = '7'; detail.product = { id: 7, stock: 10, priceCents: 100 };
  await detail.submit();
  assert.equal(s.calls[0], '/auth?from=' + encodeURIComponent('/product/7'));
});

test('repeated checkout taps send a single mutation', async () => {
  const s = setup(); s.state.user = { balanceCents: 999999 };
  let finish;
  s.client.post = async (...args) => { s.calls.push(args); return new Promise(resolve => { finish = resolve; }); };
  const detail = s.instance(s.CtDetail);
  detail.product = { id: 7, stock: 10, priceCents: 100 };
  const first = detail.submit();
  await detail.submit();
  assert.equal(s.calls.length, 1);
  finish({ order: { id: 9 } }); await first;
});

test('backend single-order limit is respected even when stock exceeds 99', async () => {
  const s = setup(); s.state.user = { balanceCents: 999999 };
  const detail = s.instance(s.CtDetail);
  detail.product = { id: 1, stock: 120, priceCents: 100 };
  detail.form.quantity = 100;
  await detail.submit();
  assert.equal(s.calls.length, 0);
});

test('reading a confirmed order before the next poll does not recreate its unread badge', () => {
  const s = setup(); s.state.user = { id: 1 };
  s.recordOrders([{ id: 8, status: 'pending' }]);
  s.readOrder(8, 'confirmed');
  s.recordOrders([{ id: 8, status: 'confirmed' }]);
  assert.equal(s.Alerts.ids.length, 0);
});

test('an account response from the previous login cannot overwrite the current account', async () => {
  const s = setup(); s.state.token = 'member-a'; s.state.user = { id: 1 };
  let finish;
  s.client.get = () => new Promise(resolve => { finish = resolve; });
  const pending = s.loadAccount();
  s.state.token = 'member-b'; s.state.user = { id: 2 };
  finish({ user: { id: 1 } });
  assert.equal(await pending, null);
  assert.equal(s.state.user.id, 2);
});

test('an older account refresh cannot replace newer balance and points', async () => {
  const s = setup(); s.state.token = 'member-a';
  const deferred = [];
  s.client.get = () => new Promise(resolve => deferred.push(resolve));
  const first = s.loadAccount(), second = s.loadAccount();
  deferred[1]({ user: { id: 1, balanceCents: 120 } }); await second;
  deferred[0]({ user: { id: 1, balanceCents: 200 } }); await first;
  assert.equal(s.state.user.balanceCents, 120);
});

test('confirmation badges are scoped to the current account', () => {
  const s = setup(); s.state.user = { id: 1 };
  s.recordOrders([{ id: 8, status: 'confirmed' }]);
  assert.equal(s.Alerts.ids.length, 1);
  s.state.user = { id: 2 };
  s.recordOrders([]);
  assert.equal(s.Alerts.ids.length, 0);
});
