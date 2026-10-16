/* 接口客户端、登录态、全局提示与格式化工具 */
const TOKEN_KEY = 'fruit_shop_token';

const Auth = Vue.reactive({
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: null,
  ready: false,
});

function saveToken(token) {
  Auth.token = token || '';
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(method, path, payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (Auth.token) headers['Authorization'] = 'Bearer ' + Auth.token;

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    const error = new Error(data.error || '请求失败（' + res.status + '）');
    error.status = res.status;
    throw error;
  }
  return data;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body || {}),
  put: (path, body) => request('PUT', path, body || {}),
  del: (path) => request('DELETE', path),
};

/* ---------------------------------------------------------------- 全局提示 */
const Toast = Vue.reactive({ list: [] });
let toastSeq = 0;

function toast(message, type) {
  const id = ++toastSeq;
  Toast.list.push({ id, message, type: type || 'success' });
  setTimeout(() => {
    Toast.list = Toast.list.filter((t) => t.id !== id);
  }, 3200);
}

/* ---------------------------------------------------------------- 格式化 */
function fmtMoney(cents) {
  return '¥' + (Number(cents || 0) / 100).toFixed(2);
}

function fmtPoints(points) {
  return Number(points || 0).toLocaleString('zh-CN');
}

function yuanToCents(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function centsToYuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function fmtTime(value) {
  return value || '—';
}

function defaultPickupTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  );
}

function prettyPickup(value) {
  if (!value) return '到店自提（时间不限）';
  return String(value).replace('T', ' ');
}

/* ---------------------------------------------------------------- 路由 */
const Router = Vue.reactive({ path: '/', query: {} });

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const parts = raw.split('?');
  Router.path = parts[0] || '/';
  Router.query = Object.fromEntries(new URLSearchParams(parts[1] || ''));
}

function navigate(path) {
  if (location.hash === '#' + path) {
    parseHash();
    return;
  }
  location.hash = '#' + path;
}

window.addEventListener('hashchange', parseHash);

/* ---------------------------------------------------------------- 登录态 */
async function bootstrapAuth() {
  if (!Auth.token) {
    Auth.ready = true;
    return;
  }
  try {
    const data = await api.get('/auth/me');
    Auth.user = data.user;
  } catch (e) {
    saveToken('');
    Auth.user = null;
  }
  Auth.ready = true;
}

async function doLogout() {
  try {
    await api.post('/auth/logout');
  } catch (e) {
    /* 令牌失效时忽略 */
  }
  saveToken('');
  Auth.user = null;
  toast('已退出登录');
  navigate('/');
}

function requireLogin(redirect) {
  if (Auth.user) return true;
  toast('请先登录会员账户', 'danger');
  navigate('/login?redirect=' + encodeURIComponent(redirect || Router.path));
  return false;
}

function requireMerchant() {
  if (!Auth.user) {
    toast('请先登录商户账户', 'danger');
    navigate('/login?redirect=%2Fadmin');
    return false;
  }
  if (!Auth.user.isMerchant) {
    toast('当前账户不是商户，无权进入后台', 'danger');
    navigate('/');
    return false;
  }
  return true;
}
