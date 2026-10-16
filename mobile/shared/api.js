/* ============================================================================
 * 果子来了 · 移动端共享层（冻结文件，请勿擅自修改）
 * ----------------------------------------------------------------------------
 * 商户端 APP  /  客户端 APP  都通过这里访问后端，保证三个人的工作相互独立。
 *
 * 【只读约定】本文件与 theme.css 由框架维护。
 *   若需要新增能力（例如分页、上传图片），先在群里提出，由后端同学确认接口后再统一修改；
 *   不要在各自目录里复制粘贴一份改过的副本，否则两端会分叉。
 *
 * 【接口契约】后端已冻结，路径与字段名以 shop/api.py 为准：
 *   账户
 *     POST   /auth/register      { phone, password, nickname? }            -> { token, user }
 *     POST   /auth/login         { phone, password }                        -> { token, user }
 *     POST   /auth/logout        (需登录)
 *     GET    /auth/me            (需登录) -> { user, balanceLogs[], pointsLogs[] }
 *     POST   /auth/profile       { nickname }                               -> { user }
 *   商品
 *     GET    /products           ?keyword=&category=&scope=all(商户端)      -> { products[], categories[] }
 *     GET    /products/<id>                                                 -> { product }
 *     POST   /products/<id>/status     { status: 'on'|'off' }      （商户）
 *     POST   /merchant/products        { name, category, priceCents, originPriceCents,
 *                                        unit, stock, description, imageUrl, status }  （商户, 新增）
 *     PUT    /merchant/products/<id>   （商户, 局部字段即可）
 *     DELETE /merchant/products/<id>/delete                          （商户）
 *   预约订单
 *     GET    /orders             ?status=pending|confirmed|completed|cancelled|all[&keyword=]
 *                                会员只见自己的；商户见全部           -> { orders[] }
 *     POST   /orders             { productId, quantity, pickupTime, payMethod, note }
 *                                                                   -> { order }
 *     POST   /orders/<id>/cancel （会员自助取消，需本人）
 *     POST   /merchant/orders/<id>/status  { status }                （商户：confirmed/completed/cancelled）
 *   积分奖品
 *     GET    /prizes             ?scope=all(商户端含下架)             -> { prizes[] }
 *     GET    /redemptions        ?status=                              -> { redemptions[] }
 *     POST   /redemptions        { prizeId }                          -> { redemption, prize }
 *     POST   /redemptions/<id>/status { status: 'done'|'cancelled' }  （商户发放）
 *     POST   /merchant/prizes    { name, costPoints, stock, description, imageUrl, status }（商户）
 *     PUT    /merchant/prizes/<id>                                    （商户）
 *     DELETE /merchant/prizes/<id>/delete                             （商户）
 *   会员（商户）
 *     GET    /merchant/members   ?keyword= -> { members[] }（含 orderCount / totalSpentCents）
 *     GET    /merchant/members/<id>        -> { member, balanceLogs[], pointsLogs[], orders[] }
 *     POST   /merchant/members/<id>/balance { changeCents, reason }    // 正数充值、负数扣减
 *   公告
 *     GET    /announcements                                           -> { announcements[] }
 *     POST   /merchant/announcements        { title, content }        （商户）
 *     PUT    /merchant/announcements/<id>                             （商户）
 *     DELETE /merchant/announcements/<id>/delete                      （商户）
 *   概览（商户）
 *     GET    /merchant/stats    -> { stats: { salesCents, orderCount, pendingCount, memberCount, ... } }
 *
 *   约定：金额字段一律是「分」的整数；时间字段是 'YYYY-MM-DD HH:MM:SS' 字符串。
 * ==========================================================================*/
(function (global) {
  'use strict';

  var DEFAULT_TIMEOUT = 15000;

  /* ------------------------------------------------------------ 基础工具 */
  function fmtMoney(cents) {
    return '¥' + (Number(cents || 0) / 100).toFixed(2);
  }

  function centsToYuan(cents) {
    return (Number(cents || 0) / 100).toFixed(2);
  }

  function yuanToCents(yuan) {
    var n = Number(yuan);
    return isFinite(n) ? Math.round(n * 100) : 0;
  }

  function fmtTime(value) {
    return value ? String(value).replace('T', ' ') : '—';
  }

  function shortTime(value) {
    if (!value) return '—';
    return String(value).slice(5, 16); // MM-DD HH:MM
  }

  /* ------------------------------------------------------------ 轻提示 */
  function toastHost() {
    var host = document.getElementById('fm-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'fm-toast-host';
      host.className = 'fm-toast-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type) {
    var host = toastHost();
    var node = document.createElement('div');
    node.className = 'fm-toast fm-toast-' + (type || 'success');
    node.textContent = message;
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('fm-toast-out');
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 200);
    }, 2400);
  }

  /* ------------------------------------------------------------ API 客户端 */
  function createClient(options) {
    // 优先级：?api= 临时地址 > 上次记住的地址 > 编译期注入地址 > 同源 /api
    var cfg = {
      baseUrl: (options && options.baseUrl) || global.FM_API_BASE || '/api',
      tokenKey: (options && options.tokenKey) || 'fm_token',
    };

    // 真机 / 模拟器调试：?api=http://192.168.1.10:8000/api 会被记住，方便指向局域网后端
    var fromQuery = new URLSearchParams(location.search).get('api');
    if (fromQuery) {
      localStorage.setItem(cfg.tokenKey + '_api', fromQuery);
    }
    var saved = localStorage.getItem(cfg.tokenKey + '_api');
    if (saved) cfg.baseUrl = saved;

    var state = Vue.reactive({
      token: localStorage.getItem(cfg.tokenKey) || '',
      user: null,
      ready: false,
      loading: false,
    });

    function saveToken(token) {
      state.token = token || '';
      if (token) localStorage.setItem(cfg.tokenKey, token);
      else localStorage.removeItem(cfg.tokenKey);
    }

    async function request(method, path, payload) {
      var url = /^https?:/.test(path) ? path : cfg.baseUrl + path;
      var headers = { 'Content-Type': 'application/json' };
      if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, DEFAULT_TIMEOUT);

      var res;
      try {
        res = await fetch(url, {
          method: method,
          headers: headers,
          body: payload === undefined ? undefined : JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        throw new Error('网络连接失败，请检查后端地址与网络');
      }
      clearTimeout(timer);

      var data = {};
      try { data = await res.json(); } catch (err) { data = {}; }

      if (res.status === 401) {
        saveToken('');
        state.user = null;
      }
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || ('请求失败（' + res.status + '）'));
      }
      return data;
    }

    return {
      config: cfg,
      state: state,
      saveToken: saveToken,

      get: function (path) { return request('GET', path); },
      post: function (path, body) { return request('POST', path, body || {}); },
      put: function (path, body) { return request('PUT', path, body || {}); },
      del: function (path) { return request('DELETE', path); },

      /** 登录并写入令牌 */
      async login(phone, password) {
        var data = await request('POST', '/auth/login', { phone: phone, password: password });
        saveToken(data.token);
        state.user = data.user;
        return data.user;
      },

      /** 注册并自动登录 */
      async register(phone, password, nickname) {
        var data = await request('POST', '/auth/register', {
          phone: phone, password: password, nickname: nickname || '',
        });
        saveToken(data.token);
        state.user = data.user;
        return data.user;
      },

      /** 启动时恢复登录态；失败不抛出，静默降级为未登录 */
      async loadMe() {
        if (!state.token) { state.ready = true; return null; }
        try {
          var data = await request('GET', '/auth/me');
          state.user = data.user;
        } catch (err) {
          state.user = null;
        }
        state.ready = true;
        return state.user;
      },

      /** 下拉刷新用户余额/积分（下单、兑换、调余额后调用） */
      async refreshUser() {
        if (!state.token) return null;
        try {
          var data = await request('GET', '/auth/me');
          state.user = data.user;
          return data.user;
        } catch (err) {
          return state.user;
        }
      },

      async logout() {
        try { await request('POST', '/auth/logout'); } catch (err) { /* 忽略 */ }
        saveToken('');
        state.user = null;
      },

      isLogin: function () { return !!state.user; },
      isMerchant: function () { return !!(state.user && state.user.isMerchant); },
    };
  }

  /* ------------------------------------------------------------ 极简 hash 路由 */
  function createRouter(fallback) {
    var router = Vue.reactive({ path: '/', query: {}, params: {} });

    function parse() {
      var raw = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
      var parts = raw.split('?');
      router.path = parts[0] || '/';
      router.query = Object.fromEntries(new URLSearchParams(parts[1] || ''));
    }

    function navigate(path) {
      if (location.hash === '#' + path) parse();
      else location.hash = '#' + path;
    }

    function onStart(handler) {
      window.addEventListener('hashchange', function () { parse(); handler(router); });
      parse();
      handler(router);
    }

    return { state: router, parse: parse, navigate: navigate, onStart: onStart, fallback: fallback };
  }

  /* ------------------------------------------------------------ 导出 */
  global.FM = {
    VERSION: '1.0.0-frozen',
    createClient: createClient,
    createRouter: createRouter,
    toast: toast,
    fmtMoney: fmtMoney,
    centsToYuan: centsToYuan,
    yuanToCents: yuanToCents,
    fmtTime: fmtTime,
    shortTime: shortTime,
  };
})(window);
