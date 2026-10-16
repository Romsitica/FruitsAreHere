/* ============================================================================
 * 客户端 APP（会员端）· 入口脚本
 * ----------------------------------------------------------------------------
 * 责任组员：客户端前端（移动端客户 APP）
 * 归属目录：mobile/customer/**            ← 只改这个目录里的文件
 * 只读依赖：mobile/shared/api.js、mobile/shared/theme.css（共享层，不要改）
 *
 * 已完成（可直接跑通）：登录注册、商品列表与筛选、商品详情、提交预约、
 *                     我的预约与取消、积分兑换、我的账户与流水
 * 待组员完善：见文件末尾 TODO 清单
 * ==========================================================================*/
const api = FM.createClient({ tokenKey: 'fm_customer_token' });
const Auth = api.state;

const router = FM.createRouter('/');
const R = router.state;

/* ------------------------------------------------------------ 路由表 */
const ROUTES = [
  { name: 'home',    re: /^\/$/,                 view: 'ct-home' },
  { name: 'product', re: /^\/product\/(\d+)$/,   view: 'ct-detail', keys: ['id'] },
  { name: 'orders',  re: /^\/orders$/,           view: 'ct-orders', auth: true },
  { name: 'points',  re: /^\/points$/,           view: 'ct-points' },
  { name: 'me',      re: /^\/me$/,               view: 'ct-me',     auth: true },
  { name: 'auth',    re: /^\/auth$/,             view: 'ct-auth' },
];

function resolve(path) {
  for (const route of ROUTES) {
    const m = path.match(route.re);
    if (m) {
      const params = {};
      (route.keys || []).forEach((key, i) => { params[key] = m[i + 1]; });
      return { route, params };
    }
  }
  return { route: ROUTES[0], params: {} };
}

/* ============================================================ 首页：商品 */
const CtHome = {
  data() {
    return { products: [], categories: [], notices: [], keyword: '', category: '全部', loading: true };
  },
  created() { this.load(); },
  methods: {
    navigate: router.navigate,
    fmtMoney: FM.fmtMoney,
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams();
        if (this.keyword) q.set('keyword', this.keyword);
        if (this.category !== '全部') q.set('category', this.category);
        const [goods, notices] = await Promise.all([
          api.get('/products?' + q.toString()),
          api.get('/announcements'),
        ]);
        this.products = goods.products;
        this.categories = ['全部'].concat(goods.categories || []);
        this.notices = notices.announcements.slice(0, 3);
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    pick(name) { this.category = name; this.load(); },
  },
  template: `
  <div>
    <header class="fm-navbar">
      <div>
        <div class="fm-navbar-title">果子来了<span class="fm-navbar-sub">会员端</span></div>
      </div>
      <div class="fm-navbar-actions">
        <button class="fm-btn fm-btn-sm" @click="navigate('/points')">积分兑换</button>
      </div>
    </header>

    <div class="ct-hero">
      <h2>好水果，预约着吃</h2>
      <p>线上下单锁定库存，到店自提不排队</p>
    </div>

    <div class="ct-notice fm-section" v-if="notices.length">
      <div class="fm-card">
        <div class="fm-card-head">
          <h3 class="fm-card-title" style="margin:0">门店公告</h3>
          <span class="fm-muted">{{ notices.length }} 条</span>
        </div>
        <div class="ct-notice-item" v-for="item in notices" :key="item.id">
          <b>{{ item.title }}</b>
          <p>{{ item.content }}</p>
        </div>
      </div>
    </div>

    <form class="ct-search fm-section" @submit.prevent="load">
      <input class="fm-input" v-model.trim="keyword" placeholder="搜索水果名称 / 关键词">
      <button class="fm-btn fm-btn-primary" type="submit">搜索</button>
    </form>

    <div class="fm-chips">
      <button v-for="name in categories" :key="name"
              :class="['fm-chip', category === name ? 'active' : '']" @click="pick(name)">{{ name }}</button>
    </div>

    <div class="fm-section">
      <div v-if="loading" class="fm-loading">正在加载鲜果…</div>
      <div v-else-if="!products.length" class="fm-empty">
        <div class="fm-empty-ring"></div>
        <p>没有找到符合条件的水果</p>
      </div>
      <template v-else>
        <div class="fm-card ct-goods" v-for="item in products" :key="item.id" @click="navigate('/product/' + item.id)">
          <img class="ct-goods-img" :src="item.imageUrl" :alt="item.name" loading="lazy">
          <div class="ct-goods-main">
            <b>{{ item.name }}</b>
            <p class="fm-muted">{{ item.description }}</p>
            <div class="ct-goods-foot">
              <span class="fm-price-sm">{{ fmtMoney(item.priceCents) }}</span>
              <span class="fm-unit">/ {{ item.unit }}</span>
              <span class="fm-origin" v-if="item.originPriceCents > item.priceCents">{{ fmtMoney(item.originPriceCents) }}</span>
              <span class="fm-badge is-muted" v-if="item.stock <= 10">仅剩 {{ item.stock }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>`,
};

/* ============================================================ 商品详情 */
const CtDetail = {
  props: { id: String },
  data() {
    return {
      Auth,
      product: null, loading: true, submitting: false,
      form: { quantity: 1, pickupTime: defaultPickup(), payMethod: 'onsite', note: '' },
    };
  },
  computed: {
    totalCents() { return this.product ? this.product.priceCents * this.form.quantity : 0; },
  },
  created() { this.load(); },
  methods: {
    navigate: router.navigate,
    fmtMoney: FM.fmtMoney,
    prettyPickup(v) { return v ? v.replace('T', ' ') : '到店自提（时间不限）'; },
    async load() {
      this.loading = true;
      try {
        this.product = (await api.get('/products/' + this.id)).product;
      } catch (e) {
        FM.toast(e.message, 'danger');
        router.navigate('/');
      } finally { this.loading = false; }
    },
    step(delta) {
      const next = this.form.quantity + delta;
      if (next < 1 || (this.product && next > this.product.stock)) return;
      this.form.quantity = next;
    },
    async submit() {
      if (!Auth.user) {
        FM.toast('请先登录会员账户', 'danger');
        router.navigate('/auth');
        return;
      }
      this.submitting = true;
      try {
        await api.post('/orders', {
          productId: this.product.id,
          quantity: this.form.quantity,
          pickupTime: this.form.pickupTime ? this.form.pickupTime.replace('T', ' ') : '',
          payMethod: this.form.payMethod,
          note: this.form.note,
        });
        await api.refreshUser();
        FM.toast('预约成功，请到「预约」中查看');
        router.navigate('/orders');
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.submitting = false; }
    },
  },
  template: `
  <div>
    <header class="fm-navbar">
      <button class="fm-back" @click="navigate('/')">‹</button>
      <div class="fm-navbar-title">商品详情</div>
    </header>
    <div v-if="loading" class="fm-loading">正在加载…</div>
    <div v-else-if="product" class="fm-section">
      <img class="fm-thumb-lg" :src="product.imageUrl" :alt="product.name">
      <div class="fm-card" style="margin-top:12px">
        <span class="fm-badge is-brand">{{ product.category }}</span>
        <h2 class="ct-title">{{ product.name }}</h2>
        <p class="fm-muted">{{ product.description }}</p>
        <div class="ct-price-row">
          <span class="fm-price">{{ fmtMoney(product.priceCents) }}</span>
          <span class="fm-unit">/ {{ product.unit }}</span>
          <span class="fm-origin" v-if="product.originPriceCents > product.priceCents">{{ fmtMoney(product.originPriceCents) }}</span>
        </div>
        <div class="fm-kv"><span>库存</span><b>{{ product.stock }} {{ product.unit.split('/')[0].trim() }}</b></div>
        <div class="fm-kv"><span>已售</span><b>{{ product.sales }}</b></div>
      </div>

      <div class="fm-card">
        <h3 class="fm-card-title">预约信息</h3>
        <div class="fm-field">
          <label class="fm-label">预约数量</label>
          <div class="fm-stepper">
            <button class="fm-btn fm-btn-sm" @click="step(-1)">-</button>
            <input class="fm-input" type="number" min="1" :max="product.stock" v-model.number="form.quantity">
            <button class="fm-btn fm-btn-sm" @click="step(1)">+</button>
            <span class="fm-muted">合计 <b class="fm-price-sm">{{ fmtMoney(totalCents) }}</b></span>
          </div>
        </div>
        <div class="fm-field">
          <label class="fm-label">预约取货时间</label>
          <input class="fm-input" type="datetime-local" v-model="form.pickupTime">
        </div>
        <div class="fm-field">
          <label class="fm-label">支付方式</label>
          <select class="fm-select" v-model="form.payMethod">
            <option value="onsite">到店支付（取货时结算）</option>
            <option value="balance">余额支付（当前 {{ Auth.user ? fmtMoney(Auth.user.balanceCents) : '未登录' }}）</option>
          </select>
        </div>
        <div class="fm-field">
          <label class="fm-label">备注</label>
          <input class="fm-input" v-model.trim="form.note" maxlength="60" placeholder="选填，如：需要帮忙切块">
        </div>
        <button class="fm-btn fm-btn-primary fm-btn-block fm-btn-lg" :disabled="submitting || product.stock <= 0" @click="submit">
          {{ product.stock <= 0 ? '暂时缺货' : (submitting ? '提交中…' : '提交预约') }}
        </button>
        <p class="fm-hint">提交后门店会尽快确认，取货时间 {{ prettyPickup(form.pickupTime) }}</p>
      </div>
    </div>
  </div>`,
};

function defaultPickup() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ============================================================ 我的预约 */
const CtOrders = {
  data() { return { orders: [], status: 'all', loading: true }; },
  created() { this.load(); },
  methods: {
    fmtMoney: FM.fmtMoney,
    prettyPickup(v) { return v || '时间不限'; },
    async load() {
      this.loading = true;
      try {
        this.orders = (await api.get('/orders?status=' + this.status)).orders;
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },
    async cancel(order) {
      if (!window.confirm('确定取消预约 ' + order.orderNo + ' 吗？')) return;
      try {
        await api.post('/orders/' + order.id + '/cancel');
        await api.refreshUser();
        FM.toast('已取消，库存与余额已退回');
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <header class="fm-navbar"><div class="fm-navbar-title">我的预约</div></header>
    <div class="fm-chips">
      <button v-for="item in [['all','全部'],['pending','待确认'],['confirmed','已确认'],['completed','已完成'],['cancelled','已取消']]"
              :key="item[0]" :class="['fm-chip', status === item[0] ? 'active' : '']"
              @click="status = item[0]; load()">{{ item[1] }}</button>
    </div>
    <div class="fm-section">
      <div v-if="loading" class="fm-loading">正在加载…</div>
      <div v-else-if="!orders.length" class="fm-empty">
        <div class="fm-empty-ring"></div>
        <p>还没有预约记录</p>
        <button class="fm-btn fm-btn-ghost fm-btn-sm" @click="$root.go('/')">去挑水果</button>
      </div>
      <div class="fm-card" v-for="order in orders" :key="order.id">
        <div class="ct-order-head">
          <b>{{ order.productName }}</b>
          <span class="fm-badge" :class="{
            'is-warn': order.status === 'pending', 'is-info': order.status === 'confirmed',
            'is-ok': order.status === 'completed', 'is-muted': order.status === 'cancelled' }">{{ order.statusText }}</span>
        </div>
        <p class="fm-muted">订单号 {{ order.orderNo }}</p>
        <div class="ct-order-foot">
          <div>
            <div class="fm-price-sm">{{ fmtMoney(order.totalCents) }}</div>
            <div class="fm-muted">{{ fmtMoney(order.unitPriceCents) }} × {{ order.quantity }} · {{ order.payMethod === 'balance' ? '余额支付' : '到店支付' }}</div>
          </div>
          <div class="ct-order-actions">
            <span class="fm-muted">{{ prettyPickup(order.pickupTime) }}</span>
            <button v-if="order.status === 'pending' || order.status === 'confirmed'"
                    class="fm-btn fm-btn-sm fm-btn-danger" @click="cancel(order)">取消预约</button>
          </div>
        </div>
        <p class="fm-muted" v-if="order.pointsGained">已获 {{ order.pointsGained }} 积分</p>
      </div>
    </div>
  </div>`,
};

/* ============================================================ 积分兑换 */
const CtPoints = {
  data() { return { Auth, prizes: [], redemptions: [], loading: true, target: null }; },
  created() { this.load(); },
  methods: {
    fmtMoney: FM.fmtMoney,
    async load() {
      this.loading = true;
      try {
        const tasks = [api.get('/prizes')];
        if (Auth.user) tasks.push(api.get('/redemptions'));
        const [prizes, redemptions] = await Promise.all(tasks);
        this.prizes = prizes.prizes;
        this.redemptions = redemptions ? redemptions.redemptions : [];
        await api.refreshUser();
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },
    ask(prize) {
      if (!Auth.user) { FM.toast('请先登录会员账户', 'danger'); router.navigate('/auth'); return; }
      if (Auth.user.points < prize.costPoints) {
        FM.toast('积分不足，还差 ' + (prize.costPoints - Auth.user.points) + ' 积分', 'danger');
        return;
      }
      this.target = prize;
    },
    async confirm() {
      try {
        await api.post('/redemptions', { prizeId: this.target.id });
        await api.refreshUser();
        FM.toast('兑换成功，请到店领取「' + this.target.name + '」');
        this.target = null;
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <header class="fm-navbar"><div class="fm-navbar-title">积分兑换</div></header>
    <div class="fm-section">
      <div class="ct-points-banner">
        <span>我的积分</span>
        <b>{{ Auth.user ? Auth.user.points : '登录后查看' }}</b>
        <em>预约订单完成后 1 元 = 1 积分</em>
      </div>
    </div>
    <div class="fm-section">
      <div v-if="loading" class="fm-loading">正在加载奖品…</div>
      <div v-else class="fm-card ct-prize" v-for="prize in prizes" :key="prize.id">
        <img class="ct-prize-img" :src="prize.imageUrl" :alt="prize.name" loading="lazy">
        <div class="ct-prize-main">
          <b>{{ prize.name }}</b>
          <p class="fm-muted">{{ prize.description }}</p>
          <div class="ct-prize-foot">
            <span class="fm-price-sm">{{ prize.costPoints }} 积分</span>
            <span class="fm-muted">剩 {{ prize.stock }}</span>
            <button class="fm-btn fm-btn-sm fm-btn-primary" :disabled="prize.stock <= 0" @click="ask(prize)">
              {{ prize.stock <= 0 ? '已兑完' : '兑换' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="fm-block-title" v-if="redemptions.length">我的兑换记录</div>
    <div class="fm-section" v-if="redemptions.length">
      <div class="fm-list">
        <div class="fm-row" v-for="item in redemptions" :key="item.id">
          <div class="fm-row-main">
            <p class="fm-row-title">{{ item.prizeName }}</p>
            <p class="fm-row-desc">{{ item.createdAt }} · {{ item.costPoints }} 积分</p>
          </div>
          <span class="fm-badge" :class="item.status === 'done' ? 'is-ok' : (item.status === 'cancelled' ? 'is-muted' : 'is-warn')">{{ item.statusText }}</span>
        </div>
      </div>
    </div>

    <div class="fm-mask" v-if="target" @click="target = null"></div>
    <div class="fm-sheet" v-if="target">
      <h3 class="fm-sheet-title">确认兑换</h3>
      <p>使用 <b>{{ target.costPoints }}</b> 积分兑换「<b>{{ target.name }}</b>」</p>
      <p class="fm-muted">兑换后请到门店凭手机号领取。</p>
      <div class="fm-sheet-foot">
        <button class="fm-btn" @click="target = null">再想想</button>
        <button class="fm-btn fm-btn-primary" @click="confirm">确认兑换</button>
      </div>
    </div>
  </div>`,
};

/* ============================================================ 我的 */
const CtMe = {
  data() { return { Auth, logs: [], pointsLogs: [], tab: 'balance', nickname: '' }; },
  async created() {
    const data = await api.get('/auth/me');
    Auth.user = data.user;
    this.nickname = data.user.nickname;
    this.logs = data.balanceLogs;
    this.pointsLogs = data.pointsLogs;
  },
  methods: {
    fmtMoney: FM.fmtMoney,
    async saveNickname() {
      try {
        Auth.user = (await api.post('/auth/profile', { nickname: this.nickname })).user;
        FM.toast('昵称已更新');
      } catch (e) { FM.toast(e.message, 'danger'); }
    },
    async logout() {
      await api.logout();
      FM.toast('已退出登录');
      router.navigate('/');
    },
  },
  template: `
  <div>
    <header class="fm-navbar"><div class="fm-navbar-title">我的</div></header>
    <div class="fm-section">
      <div class="ct-me-head">
        <div class="ct-avatar">{{ Auth.user ? Auth.user.nickname.slice(0,1) : '?' }}</div>
        <div>
          <b>{{ Auth.user.nickname }}</b>
          <p class="fm-muted">{{ Auth.user.phone }}</p>
        </div>
      </div>
      <div class="fm-wallet" style="margin-top:12px">
        <div class="fm-wallet-item"><span>账户余额</span><b class="ct-amount">{{ fmtMoney(Auth.user.balanceCents) }}</b></div>
        <div class="fm-wallet-item"><span>我的积分</span><b class="ct-amount">{{ Auth.user.points }}</b></div>
      </div>
    </div>

    <div class="fm-section">
      <div class="fm-card">
        <h3 class="fm-card-title">资料设置</h3>
        <div class="fm-field">
          <label class="fm-label">昵称</label>
          <input class="fm-input" v-model.trim="nickname" maxlength="16">
        </div>
        <button class="fm-btn fm-btn-primary fm-btn-block" @click="saveNickname">保存</button>
      </div>
    </div>

    <div class="fm-block-title">账户流水
      <span>
        <button :class="['fm-chip', tab === 'balance' ? 'active' : '']" @click="tab = 'balance'">余额</button>
        <button :class="['fm-chip', tab === 'points' ? 'active' : '']" @click="tab = 'points'">积分</button>
      </span>
    </div>
    <div class="fm-section">
      <div class="fm-list">
        <div class="fm-row" v-for="log in (tab === 'balance' ? logs : pointsLogs)" :key="log.id">
          <div class="fm-row-main">
            <p class="fm-row-title">{{ log.reason }}</p>
            <p class="fm-row-desc">{{ log.createdAt }} · 操作人 {{ log.operator || '系统' }}</p>
          </div>
          <div class="fm-row-side">
            <b :class="(log.changeCents || log.change) > 0 ? 'ct-up' : 'ct-down'">
              {{ (log.changeCents || log.change) > 0 ? '+' : '' }}{{ tab === 'balance' ? fmtMoney(log.changeCents) : log.change }}
            </b>
          </div>
        </div>
        <div v-if="!(tab === 'balance' ? logs : pointsLogs).length" class="fm-empty"><p>暂无流水</p></div>
      </div>
    </div>

    <div class="fm-section">
      <button class="fm-btn fm-btn-danger fm-btn-block" @click="logout">退出登录</button>
    </div>
  </div>`,
};

/* ============================================================ 登录 / 注册 */
const CtAuth = {
  data() { return { mode: 'login', form: { phone: '', password: '', confirm: '', nickname: '' }, submitting: false }; },
  methods: {
    navigate: router.navigate,
    fill(kind) {
      this.form.phone = kind === 'demo' ? '13900000001' : '';
      this.form.password = kind === 'demo' ? '123456' : '';
    },
    async submit() {
      if (this.mode === 'register' && this.form.password !== this.form.confirm) {
        FM.toast('两次输入的密码不一致', 'danger');
        return;
      }
      this.submitting = true;
      try {
        if (this.mode === 'login') {
          await api.login(this.form.phone, this.form.password);
          FM.toast('欢迎回来');
        } else {
          await api.register(this.form.phone, this.form.password, this.form.nickname);
          FM.toast('注册成功');
        }
        router.navigate(R.query.from || '/');
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.submitting = false; }
    },
  },
  template: `
  <div class="fm-auth">
    <div class="fm-auth-logo"></div>
    <h1>果子来了</h1>
    <p class="fm-auth-sub">手机号即会员账号，预约下单、累计积分</p>
    <div class="fm-chips" style="padding:0 0 16px">
      <button :class="['fm-chip', mode === 'login' ? 'active' : '']" @click="mode = 'login'">登录</button>
      <button :class="['fm-chip', mode === 'register' ? 'active' : '']" @click="mode = 'register'">注册</button>
    </div>
    <div class="fm-field">
      <label class="fm-label">手机号</label>
      <input class="fm-input" type="tel" maxlength="11" v-model.trim="form.phone" placeholder="请输入 11 位手机号">
    </div>
    <div class="fm-field" v-if="mode === 'register'">
      <label class="fm-label">昵称（选填）</label>
      <input class="fm-input" maxlength="16" v-model.trim="form.nickname">
    </div>
    <div class="fm-field">
      <label class="fm-label">密码</label>
      <input class="fm-input" type="password" v-model="form.password" placeholder="至少 6 位">
    </div>
    <div class="fm-field" v-if="mode === 'register'">
      <label class="fm-label">确认密码</label>
      <input class="fm-input" type="password" v-model="form.confirm">
    </div>
    <button class="fm-btn fm-btn-primary fm-btn-block fm-btn-lg" :disabled="submitting" @click="submit">
      {{ submitting ? '提交中…' : (mode === 'login' ? '登录' : '注册并登录') }}
    </button>
    <div class="fm-demo">
      <span>演示账号</span>
      <button class="fm-btn fm-btn-sm" @click="fill('demo')">会员 13900000001 / 123456</button>
    </div>
  </div>`,
};

/* ============================================================ 根组件 */
const TABS = [
  { path: '/', label: '首页' },
  { path: '/orders', label: '预约' },
  { path: '/points', label: '积分' },
  { path: '/me', label: '我的' },
];

const App = {
  data() { return { Auth, R, resolved: { route: ROUTES[0], params: {} }, tabs: TABS }; },
  computed: {
    view() {
      const target = this.resolved.route;
      if (target.auth && !Auth.user) return 'ct-auth';
      return target.view;
    },
    showTab() { return TABS.some((t) => t.path === R.path); },
    activeTab() { return R.path; },
  },
  created() {
    router.onStart((r) => { this.resolved = resolve(r.path); });
  },
  template: `
  <div class="fm-app">
    <div class="fm-body">
      <component :is="view" v-bind="resolved.params" :key="R.path"></component>
    </div>
    <nav class="fm-tabbar" v-if="showTab">
      <button v-for="tab in tabs" :key="tab.path"
              :class="['fm-tab', activeTab === tab.path ? 'active' : '']"
              @click="go(tab.path)">
        <span class="fm-tab-dot"></span>{{ tab.label }}
      </button>
    </nav>
  </div>`,
  methods: {
    go(path) { router.navigate(path); },
  },
};

(async function main() {
  await api.loadMe();
  const app = Vue.createApp(App);
  app.component('ct-home', CtHome);
  app.component('ct-detail', CtDetail);
  app.component('ct-orders', CtOrders);
  app.component('ct-points', CtPoints);
  app.component('ct-me', CtMe);
  app.component('ct-auth', CtAuth);
  app.mount('#app');
})();

/* ============================================================================
 * TODO（客户端前端组员，按优先级）
 * ----------------------------------------------------------------------------
 * P0 体验补齐
 *   1) 首页下拉刷新 + 触底加载更多（后端 /products 目前一次返回全部，需要分页请找后端同学加 page/pageSize）
 *   2) 商品详情图片轮播（当前只有单张主图，多图需后端加 images 字段）
 *   3) 订单详情页：现在只有列表，建议新增 router '/orders/:id' 展示完整字段与取货二维码
 * P1 功能补全
 *   4) 收货/取货提醒：订单状态变 confirmed 时用 Notification API 或应用内红点提示
 *   5) 积分明细页：把 CtMe 里的流水抽成独立页面，支持按类型筛选
 *   6) 个人资料：增加修改密码（后端暂无该接口，需后端同学补 POST /auth/password）
 * P2 打磨
 *   7) 骨架屏（.fm-skeleton 已提供）替换当前的 fm-loading 文本
 *   8) 页面切换动画、tab 图标（当前是 CSS 方块，可换 SVG）
 *
 * 只允许改：mobile/customer/**。共享层 mobile/shared/** 只读，
 * 需要新增通用能力请先在群里同步，不要复制一份改过的共享层副本。
 * ==========================================================================*/
