<<<<<<< HEAD
/* 客户端专属。共享 API、样式及其他模块只读。 */
const api = FM.createClient({ tokenKey: 'fm_customer_token' });
const Auth = api.state;
const router = FM.createRouter('/');
const R = router.state;
const Alerts = Vue.reactive({ ids: [], statuses: {}, userKey: '' });
const ROUTES = [
  { name: 'home', re: /^\/$/, view: 'ct-home' },
  { name: 'product', re: /^\/product\/(\d+)$/, view: 'ct-detail', keys: ['id'] },
  { name: 'order', re: /^\/orders\/(\d+)$/, view: 'ct-order-detail', keys: ['id'], auth: true },
  { name: 'orders', re: /^\/orders$/, view: 'ct-orders', auth: true },
  { name: 'ledger', re: /^\/points\/logs$/, view: 'ct-ledger', auth: true },
  { name: 'points', re: /^\/points$/, view: 'ct-points' },
  { name: 'me', re: /^\/me$/, view: 'ct-me', auth: true },
  { name: 'auth', re: /^\/auth$/, view: 'ct-auth' },
];
function resolve(path) {
  for (const route of ROUTES) {
    const m = path.match(route.re);
    if (m) return { route, params: Object.fromEntries((route.keys || []).map((key, i) => [key, m[i + 1]])) };
  }
  return { route: ROUTES[0], params: {} };
}
function loginFor(path) { router.navigate('/auth?from=' + encodeURIComponent(path)); }
function localDateTime(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function defaultPickup() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return localDateTime(d); }
function recordOrders(orders) {
  const key = Auth.user ? String(Auth.user.id || Auth.user.phone) : '';
  if (Alerts.userKey !== key) { Alerts.ids = []; Alerts.statuses = {}; Alerts.userKey = key; }
  if (!key) return;
  const confirmed = orders.filter(o => o.status === 'confirmed').map(o => o.id);
  Alerts.ids = Alerts.ids.filter(id => confirmed.includes(id));
  orders.forEach(o => {
    if (o.status === 'confirmed' && Alerts.statuses[o.id] !== 'confirmed' && !Alerts.ids.includes(o.id)) Alerts.ids.push(o.id);
    Alerts.statuses[o.id] = o.status;
  });
}
function readOrder(id, status) {
  if (status) Alerts.statuses[id] = status;
  Alerts.ids = Alerts.ids.filter(value => String(value) !== String(id));
}
let accountRequest = 0;
async function loadAccount() {
  const token = Auth.token, request = ++accountRequest;
  if (!token) return null;
  const data = await api.get('/auth/me');
  // 换号或新的账户刷新发生后，旧响应不能写入全局账户。
  if (Auth.token !== token || request !== accountRequest) return null;
  Auth.user = data.user;
  return data;
}
async function refreshAccount() {
  try { await loadAccount(); } catch (_) { /* 交易已完成，账户暂时离线不应提示交易失败 */ }
}
const statusClass = s => ({ pending: 'is-warn', confirmed: 'is-info', completed: 'is-ok', cancelled: 'is-muted' }[s] || 'is-muted');
const statusMessage = s => ({ pending: '预约已送达，等待门店确认', confirmed: '门店已确认，请按预约时间到店取货', completed: '感谢光顾，期待下一次鲜果相见', cancelled: '预约已取消，期待下次再见' }[s] || '查看预约信息');
const common = { navigate: router.navigate, fmtMoney: FM.fmtMoney, statusClass, statusMessage };

const CtIcon = { props: { name: String }, template: `<span :class="['ct-icon', 'ct-icon-' + name]" aria-hidden="true"></span>` };
const CtHeader = { props: { title: String, back: String, subtitle: String }, methods: common,
  template: `<header class="fm-navbar ct-navbar"><button v-if="back" class="ct-icon-button" @click="navigate(back)" aria-label="返回"><ct-icon name="arrow-left"/></button><div><h1 class="fm-navbar-title">{{ title }}</h1><p v-if="subtitle" class="ct-nav-sub">{{ subtitle }}</p></div><div class="fm-navbar-actions"><slot/></div></header>` };
const CtImage = {
  props: { src: String, alt: String, eager: Boolean }, data() { return { failed: false }; }, watch: { src() { this.failed = false; } },
  template: `<div class="ct-image"><img v-if="src && !failed" :src="src" :alt="alt || ''" :loading="eager ? 'eager' : 'lazy'" @error="failed = true"><div v-else class="ct-image-fallback" role="img" :aria-label="(alt || '') + '，暂无图片'"><ct-icon name="leaf"/><span>暂无图片</span></div></div>` };
const CtSkeleton = { props: { kind: String, count: { default: 3 } },
  template: `<div class="ct-skeleton" role="status" aria-label="正在加载"><span class="ct-sr-only">正在加载，请稍候</span><div v-for="n in count" :key="n" :class="['ct-skeleton-item', kind]"><div class="fm-skeleton ct-skeleton-photo"></div><div class="ct-skeleton-lines"><div class="fm-skeleton"></div><div class="fm-skeleton"></div><div class="fm-skeleton"></div></div></div></div>` };
const CtEmpty = { props: { title: String, text: String, icon: { default: 'shopping-bag' } },
  template: `<div class="fm-empty ct-empty"><ct-icon :name="icon"/><h3>{{ title }}</h3><p>{{ text }}</p><slot/></div>` };
const CtError = { props: { message: String }, emits: ['retry'],
  template: `<div class="ct-error" role="alert"><p>{{ message }}</p><button class="fm-btn fm-btn-sm" @click="$emit('retry')"><ct-icon name="refresh"/>重新加载</button></div>` };
const CtConfirm = {
  props: { title: String, busy: Boolean }, emits: ['close', 'confirm'],
  mounted() { this.previousFocus = document.activeElement; this.$refs.dialog.focus(); },
  beforeUnmount() { if (this.previousFocus && this.previousFocus.isConnected) this.previousFocus.focus(); },
  methods: {
    trap(e) {
      if (e.key === 'Escape' && !this.busy) this.$emit('close');
      if (e.key !== 'Tab') return;
      const buttons = [...this.$refs.dialog.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === this.$refs.dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === this.$refs.dialog)) { e.preventDefault(); first.focus(); }
    },
  },
  template: `<div class="ct-dialog-layer" @keydown="trap"><div class="fm-mask" @click="!busy && $emit('close')"></div><section ref="dialog" class="fm-sheet ct-dialog" role="dialog" aria-modal="true" aria-labelledby="ct-dialog-title" tabindex="-1"><div class="ct-sheet-handle"></div><h2 id="ct-dialog-title" class="fm-sheet-title">{{ title }}</h2><slot/><div class="fm-sheet-foot"><button class="fm-btn" :disabled="busy" @click="$emit('close')">再想想</button><button class="fm-btn fm-btn-primary" :disabled="busy" @click="$emit('confirm')">{{ busy ? '处理中…' : '确认' }}</button></div></section></div>` };

/* 后端暂无分页，本地每批展示 12 条，避免猜测新接口。 */
const CtHome = {
  data() { return { products: [], categories: ['全部'], notices: [], keyword: '', category: '全部', loading: true, error: '', visibleCount: 12, requestId: 0, refreshing: false, pullStart: null, pullDistance: 0, noticeOpen: false }; },
  computed: {
    visibleProducts() { return this.products.slice(0, this.visibleCount); },
    hasMore() { return this.visibleCount < this.products.length; },
  },
  created() { this.load(); },
  mounted() {
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) this.loadMore(); }, { rootMargin: '160px' });
      this.observer.observe(this.$refs.more);
    }
  },
  beforeUnmount() { this.requestId++; if (this.observer) this.observer.disconnect(); },
  methods: {
    ...common,
    async load(refresh = false) {
      refresh = refresh === true;
      const requestId = ++this.requestId;
      this.loading = !refresh; this.refreshing = refresh; this.error = '';
      const q = new URLSearchParams();
      if (this.keyword) q.set('keyword', this.keyword);
      if (this.category !== '全部') q.set('category', this.category);
      try {
        const goods = await api.get('/products?' + q.toString());
        if (requestId !== this.requestId) return;
        this.products = goods.products || []; this.visibleCount = 12;
        this.categories = [...new Set(['全部', ...(goods.categories || [])])];
        if (refresh) FM.toast('鲜果已更新');
      } catch (e) { if (requestId === this.requestId) this.error = e.message; }
      finally { if (requestId === this.requestId) { this.loading = false; this.refreshing = false; } }
      // 公告失败不阻止商品浏览。
      try { const data = await api.get('/announcements'); if (requestId === this.requestId) this.notices = (data.announcements || []).slice(0, 3); } catch (_) { /* 保留上次公告 */ }
    },
    loadMore() { if (!this.loading && !this.error && this.hasMore) this.visibleCount += 12; },
    pick(name) { this.category = name; this.load(); },
    reset() { this.keyword = ''; this.category = '全部'; this.load(); },
    touchStart(e) { this.pullStart = window.scrollY <= 0 && !this.loading && !this.refreshing ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; },
    touchMove(e) {
      if (!this.pullStart) return;
      const dy = e.touches[0].clientY - this.pullStart.y, dx = Math.abs(e.touches[0].clientX - this.pullStart.x);
      if (dy < 0 || dx > dy || window.scrollY > 0) { this.pullStart = null; this.pullDistance = 0; return; }
      this.pullDistance = Math.min(100, dy * 0.45);
      if (this.pullDistance > 12 && e.cancelable) e.preventDefault();
    },
    touchEnd() { const refresh = this.pullDistance >= 64; this.pullStart = null; this.pullDistance = 0; if (refresh) this.load(true); },
    browse() { this.$refs.catalog.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); },
  },
  template: `<div class="ct-home" @touchstart.passive="touchStart" @touchmove="touchMove" @touchend="touchEnd" @touchcancel="pullStart = null; pullDistance = 0">
    <ct-header title="果子来了" subtitle="把新鲜，带回家"><button class="ct-icon-button ct-gift-link" @click="navigate('/points')" aria-label="积分兑换"><ct-icon name="gift"/></button></ct-header>
    <div v-if="pullDistance || refreshing" class="ct-pull" role="status"><ct-icon name="refresh"/>{{ refreshing ? '正在更新鲜果…' : (pullDistance >= 64 ? '松开刷新' : '下拉刷新鲜果') }}</div>
    <section class="ct-hero"><div class="ct-hero-copy"><span class="ct-eyebrow">一口新鲜，刚刚好</span><h2>好水果，<br>预约着吃。</h2><p>线上预约，到店自提<br>给生活加一点鲜甜</p><button class="ct-hero-cta" @click="browse">去挑鲜果<ct-icon name="arrow-right"/></button></div><div class="ct-hero-photo" role="img" aria-label="新鲜芒果、猕猴桃与当季水果"></div></section>
    <div class="ct-benefits"><span><ct-icon name="leaf"/>时令鲜果</span><span><ct-icon name="shopping-bag"/>预约自提</span><span><ct-icon name="gift"/>消费攒积分</span></div>
    <section v-if="notices.length" class="ct-notice"><button class="ct-notice-toggle" @click="noticeOpen = !noticeOpen" :aria-expanded="noticeOpen"><span class="ct-notice-label"><ct-icon name="bell"/>门店公告</span><span class="ct-notice-title">{{ notices[0].title }}</span><ct-icon name="chevron-right"/></button><div v-if="noticeOpen" class="ct-notice-content"><article v-for="n in notices" :key="n.id"><h3>{{ n.title }}</h3><p>{{ n.content }}</p></article></div></section>
    <div class="fm-section ct-catalog" ref="catalog"><form class="ct-search" role="search" @submit.prevent="load()"><ct-icon name="search"/><label class="ct-sr-only" for="ct-search">搜索水果</label><input id="ct-search" type="search" v-model.trim="keyword" placeholder="今天想吃点什么？"><button type="submit">搜索</button></form>
      <div class="ct-section-heading"><h2>挑点新鲜的</h2><button class="ct-text-button" :disabled="loading || refreshing" @click="load(true)" aria-label="刷新商品"><ct-icon name="refresh"/>刷新</button></div>
      <div class="fm-chips ct-categories" aria-label="水果分类"><button v-for="name in categories" :key="name" :class="['fm-chip', {active: category === name}]" :aria-pressed="category === name" @click="pick(name)">{{ name }}</button></div>
      <ct-error v-if="error" :message="error" @retry="load()"/><ct-skeleton v-else-if="loading" kind="goods" :count="4"/>
      <ct-empty v-else-if="!products.length" title="还没找到这份鲜甜" text="换个关键词，或看看其他分类。" icon="search"><button class="fm-btn fm-btn-ghost fm-btn-sm" @click="reset">查看全部水果</button></ct-empty>
      <div v-else class="ct-goods-grid"><button class="ct-goods" v-for="item in visibleProducts" :key="item.id" @click="navigate('/product/' + item.id)"><ct-image class="ct-goods-img" :src="item.imageUrl" :alt="item.name"/><div class="ct-goods-main"><span class="ct-goods-category">{{ item.category }}</span><h3>{{ item.name }}</h3><p>{{ item.description }}</p><div class="ct-stock" v-if="item.stock <= 10">{{ item.stock <= 0 ? '暂时缺货' : '仅剩 ' + item.stock + ' 份' }}</div><div class="ct-goods-foot"><div><strong>{{ fmtMoney(item.priceCents) }}</strong><span class="fm-unit"> / {{ item.unit }}</span></div><span class="ct-add" aria-hidden="true"><ct-icon name="plus"/></span></div><span class="fm-origin" v-if="item.originPriceCents > item.priceCents">{{ fmtMoney(item.originPriceCents) }}</span></div></button></div>
      <div ref="more" class="ct-more"><button v-if="hasMore && !loading && !error" class="ct-text-button" @click="loadMore">加载更多鲜果<ct-icon name="chevron-right"/></button><span v-else-if="products.length && !loading && !error">新鲜都在这里了</span></div>
    </div></div>`,
};

/* 单图兼容；后端有 images 字符串数组时自动启用轮播。 */
const CtDetail = {
  props: { id: String },
  data() { return { Auth, product: null, loading: true, error: '', submitting: false, activeImage: 0, form: { quantity: 1, pickupTime: defaultPickup(), payMethod: 'onsite', note: '' } }; },
  computed: {
    totalCents() { return this.product ? this.product.priceCents * Number(this.form.quantity || 0) : 0; },
    images() { return this.product ? [...new Set([this.product.imageUrl, ...(Array.isArray(this.product.images) ? this.product.images.filter(v => typeof v === 'string') : [])].filter(Boolean))] : []; },
    maxQuantity() { return this.product ? Math.min(this.product.stock, 99) : 0; },
    quantityValid() { const n = Number(this.form.quantity); return Number.isInteger(n) && n >= 1 && n <= this.maxQuantity; },
  },
  created() { this.load(); },
  methods: {
    ...common, localDateTime,
    async load() { this.loading = true; this.error = ''; try { this.product = (await api.get('/products/' + this.id)).product; } catch (e) { this.error = e.message; } finally { this.loading = false; } },
    step(delta) { const next = (Number(this.form.quantity) || 1) + delta; if (next >= 1 && next <= this.maxQuantity) this.form.quantity = next; },
    imageScroll(e) { this.activeImage = Math.round(e.target.scrollLeft / e.target.clientWidth); },
    selectImage(i) { this.$refs.gallery.scrollTo({ left: i * this.$refs.gallery.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); },
    async submit() {
      if (this.submitting || !this.product) return;
      if (!Auth.user) { loginFor('/product/' + this.id); return; }
      if (!this.quantityValid) { FM.toast('请输入库存范围内的整数数量', 'danger'); return; }
      if (this.form.pickupTime && (!Number.isFinite(new Date(this.form.pickupTime).getTime()) || new Date(this.form.pickupTime) < new Date())) { FM.toast('请选择未来的取货时间', 'danger'); return; }
      if (this.form.payMethod === 'balance' && Auth.user.balanceCents < this.totalCents) { FM.toast('余额不足，请改用到店支付', 'danger'); return; }
      this.submitting = true;
      try {
        const data = await api.post('/orders', { productId: this.product.id, quantity: Number(this.form.quantity), pickupTime: this.form.pickupTime.replace('T', ' '), payMethod: this.form.payMethod, note: this.form.note });
        await refreshAccount(); FM.toast('预约成功，等待门店确认'); router.navigate('/orders/' + data.order.id);
      } catch (e) { FM.toast(e.message, 'danger'); } finally { this.submitting = false; }
    },
  },
  template: `<div class="ct-detail"><ct-header title="商品详情" back="/"/><div class="fm-section"><ct-skeleton v-if="loading" kind="detail" :count="1"/><ct-error v-else-if="error" :message="error" @retry="load"/><template v-else-if="product">
    <div class="ct-gallery" ref="gallery" @scroll.passive="imageScroll" aria-label="商品图片"><ct-image v-for="(image, i) in (images.length ? images : [''])" :key="image" :src="image" :alt="product.name + (images.length > 1 ? '，图片 ' + (i + 1) : '')" :eager="i === 0"/></div><div class="ct-gallery-dots" v-if="images.length > 1"><button v-for="(image, i) in images" :key="image" :class="{active: activeImage === i}" :aria-label="'查看第 ' + (i + 1) + ' 张商品图'" :aria-pressed="activeImage === i" @click="selectImage(i)"></button></div>
    <section class="ct-product-intro"><span class="ct-eyebrow">{{ product.category }}</span><h2>{{ product.name }}</h2><p class="ct-description">{{ product.description }}</p><div class="ct-price-row"><strong class="fm-price">{{ fmtMoney(product.priceCents) }}</strong><span class="fm-unit">/ {{ product.unit }}</span><span class="fm-origin" v-if="product.originPriceCents > product.priceCents">{{ fmtMoney(product.originPriceCents) }}</span></div><div class="ct-product-meta"><span>库存 {{ product.stock }}</span><span>已售 {{ product.sales }}</span><span>到店自提</span></div></section>
    <form class="fm-card ct-reserve" @submit.prevent="submit"><h3 class="fm-card-title">预约一份新鲜</h3><div class="fm-field"><label class="fm-label" for="ct-quantity">预约数量</label><div class="fm-stepper"><button type="button" class="fm-btn ct-step" :disabled="form.quantity <= 1" @click="step(-1)" aria-label="减少数量"><ct-icon name="minus"/></button><input id="ct-quantity" class="fm-input" type="number" inputmode="numeric" min="1" step="1" :max="maxQuantity" v-model.number="form.quantity" required><button type="button" class="fm-btn ct-step" :disabled="form.quantity >= maxQuantity" @click="step(1)" aria-label="增加数量"><ct-icon name="plus"/></button><span class="fm-unit">{{ product.unit }}</span></div></div>
    <div class="fm-field"><label class="fm-label" for="ct-pickup">预约取货时间</label><input id="ct-pickup" class="fm-input" type="datetime-local" :min="localDateTime()" v-model="form.pickupTime"></div><div class="fm-field"><label class="fm-label" for="ct-payment">支付方式</label><select id="ct-payment" class="fm-select" v-model="form.payMethod"><option value="onsite">到店支付（取货时结算）</option><option value="balance">余额支付（{{ Auth.user ? fmtMoney(Auth.user.balanceCents) : '登录后查看余额' }}）</option></select></div><div class="fm-field"><label class="fm-label" for="ct-note">备注 <span class="fm-muted">选填</span></label><input id="ct-note" class="fm-input" v-model.trim="form.note" maxlength="60" placeholder="例如：需要帮忙切块"></div><div class="ct-checkout"><span>预约合计<strong>{{ quantityValid ? fmtMoney(totalCents) : '请选择数量' }}</strong></span><button class="fm-btn fm-btn-primary fm-btn-lg" :disabled="submitting || product.stock <= 0" type="submit">{{ product.stock <= 0 ? '暂时缺货' : (submitting ? '提交中…' : '提交预约') }}<ct-icon name="arrow-right"/></button></div><p class="fm-hint">提交后由门店确认，请按预约时间到店自提。</p></form>
  </template></div></div>`,
};

const orderActions = {
  ...common,
  askCancel(order) { this.target = order; },
  async cancel() {
    if (this.busy || !this.target) return;
    this.busy = true;
    try { await api.post('/orders/' + this.target.id + '/cancel'); readOrder(this.target.id); this.target = null; await refreshAccount(); FM.toast('预约已取消，库存已恢复，余额支付款项已退回'); await this.load(); }
    catch (e) { FM.toast(e.message, 'danger'); } finally { this.busy = false; }
  },
};
const cancelDialog = `<ct-confirm v-if="target" title="取消这次预约？" :busy="busy" @close="target = null" @confirm="cancel"><p>预约号 {{ target.orderNo }}</p><p class="fm-muted">取消后将释放商品库存；如果使用余额支付，款项会退回账户。</p></ct-confirm>`;
const CtOrders = {
  data() { return { Alerts, orders: [], status: 'all', loading: true, error: '', target: null, busy: false, requestId: 0 }; },
  created() { this.load(); },
  beforeUnmount() { this.requestId++; },
  methods: {
    ...orderActions,
    async load() {
      const requestId = ++this.requestId; this.loading = true; this.error = '';
      try { const data = await api.get('/orders?status=' + this.status); if (requestId !== this.requestId) return; this.orders = data.orders || []; if (this.status === 'all') recordOrders(this.orders); }
      catch (e) { if (requestId === this.requestId) this.error = e.message; }
      finally { if (requestId === this.requestId) this.loading = false; }
    },
  },
  template: `<div><ct-header title="我的预约" subtitle="每一份新鲜，都有着落"><button class="ct-icon-button" @click="load" aria-label="刷新预约" :disabled="loading"><ct-icon name="refresh"/></button></ct-header><div v-if="Alerts.ids.length" class="ct-order-alert" role="status"><ct-icon name="bell"/>{{ Alerts.ids.length }} 笔预约已确认，点开详情查看取货信息</div><div class="fm-chips ct-order-filters"><button v-for="item in [['all','全部'],['pending','待确认'],['confirmed','已确认'],['completed','已完成'],['cancelled','已取消']]" :key="item[0]" :class="['fm-chip', {active: status === item[0]}]" :aria-pressed="status === item[0]" @click="status = item[0]; load()">{{ item[1] }}</button></div><div class="fm-section"><ct-error v-if="error" :message="error" @retry="load"/><ct-skeleton v-else-if="loading"/><ct-empty v-else-if="!orders.length" title="这里还没有预约" text="挑一份喜欢的水果，把新鲜安排好。" icon="calendar-event"><button class="fm-btn fm-btn-primary fm-btn-sm" @click="navigate('/')">去挑水果</button></ct-empty><template v-else><article class="fm-card ct-order-card" v-for="order in orders" :key="order.id"><div class="ct-order-head"><span class="ct-order-number">{{ order.orderNo }}</span><span class="fm-badge" :class="statusClass(order.status)">{{ order.statusText }}</span></div><button class="ct-order-product" @click="navigate('/orders/' + order.id)"><ct-image :src="order.imageUrl" :alt="order.productName"/><div><h2>{{ order.productName }}<span v-if="Alerts.ids.includes(order.id)" class="ct-unread" aria-label="状态有更新"></span></h2><p>{{ fmtMoney(order.unitPriceCents) }} × {{ order.quantity }}</p><strong>{{ fmtMoney(order.totalCents) }}</strong></div><ct-icon name="chevron-right"/></button><p class="ct-pickup-line"><ct-icon name="calendar-event"/>{{ order.pickupTime || '取货时间不限' }}</p><div class="ct-order-foot"><span class="fm-muted">{{ order.payMethod === 'balance' ? '余额支付' : '到店支付' }}</span><div class="ct-order-actions"><button v-if="['pending','confirmed'].includes(order.status)" class="fm-btn fm-btn-sm" @click="askCancel(order)">取消预约</button><button class="fm-btn fm-btn-ghost fm-btn-sm" @click="navigate('/orders/' + order.id)">查看详情</button></div></div></article></template></div>${cancelDialog}</div>`,
};
const CtOrderDetail = {
  props: { id: String }, data() { return { order: null, loading: true, error: '', target: null, busy: false }; },
  created() { this.load(); },
  methods: {
    ...orderActions,
    async load() { this.loading = true; this.error = ''; try { this.order = (await api.get('/orders/' + this.id)).order; readOrder(this.id, this.order.status); } catch (e) { this.error = e.message; } finally { this.loading = false; } },
    async copyOrder() { try { await navigator.clipboard.writeText(this.order.orderNo); FM.toast('预约号已复制'); } catch (_) { FM.toast('请长按预约号复制'); } },
  },
  template: `<div><ct-header title="预约详情" back="/orders"><button class="ct-icon-button" @click="load" :disabled="loading" aria-label="刷新预约详情"><ct-icon name="refresh"/></button></ct-header><div class="fm-section"><ct-skeleton v-if="loading"/><ct-error v-else-if="error" :message="error" @retry="load"/><template v-else-if="order"><section class="ct-status-panel"><span class="ct-status-icon"><ct-icon :name="order.status === 'completed' ? 'check' : 'calendar-event'"/></span><span class="fm-badge" :class="statusClass(order.status)">{{ order.statusText }}</span><h2>{{ statusMessage(order.status) }}</h2><p>{{ order.pickupTime || '取货时间不限' }}</p></section><div class="ct-order-progress" v-if="order.status !== 'cancelled'"><span class="done">已预约</span><span :class="{done: ['confirmed','completed'].includes(order.status)}">门店确认</span><span :class="{done: order.status === 'completed'}">完成取货</span></div><section class="fm-card"><div class="ct-order-product"><ct-image :src="order.imageUrl" :alt="order.productName"/><div><h2>{{ order.productName }}</h2><p>{{ fmtMoney(order.unitPriceCents) }} × {{ order.quantity }}</p><strong>{{ fmtMoney(order.totalCents) }}</strong></div></div><div class="fm-kv"><span>支付方式</span><b>{{ order.payMethod === 'balance' ? '余额支付' : '到店支付' }}</b></div><div class="fm-kv" v-if="order.pointsGained"><span>本单获得积分</span><b class="ct-up">+{{ order.pointsGained }}</b></div></section><section class="fm-card"><h3 class="fm-card-title">取货信息</h3><div class="fm-kv"><span>取货时间</span><b>{{ order.pickupTime || '时间不限' }}</b></div><div class="fm-kv"><span>预约人</span><b>{{ order.memberName }}</b></div><div class="fm-kv"><span>手机号</span><b>{{ order.memberPhone }}</b></div><div class="fm-kv"><span>备注</span><b>{{ order.note || '无备注' }}</b></div></section><section class="fm-card"><h3 class="fm-card-title">订单信息</h3><div class="fm-kv ct-order-id"><span>预约号</span><b>{{ order.orderNo }} <button class="ct-text-button" @click="copyOrder">复制</button></b></div><div class="fm-kv"><span>下单时间</span><b>{{ order.createdAt }}</b></div><div class="fm-kv"><span>更新时间</span><b>{{ order.updatedAt }}</b></div></section><button v-if="['pending','confirmed'].includes(order.status)" class="fm-btn fm-btn-danger fm-btn-block" @click="askCancel(order)">取消预约</button><button v-else class="fm-btn fm-btn-primary fm-btn-block" @click="navigate('/')">再挑点新鲜的</button></template></div>${cancelDialog}</div>`,
};

const CtPoints = {
  data() { return { Auth, prizes: [], redemptions: [], loading: true, error: '', target: null, busy: false }; },
  created() { this.load(); },
  methods: {
    ...common,
    async load() {
      this.loading = true; this.error = '';
      try { const data = await api.get('/prizes'); this.prizes = data.prizes || []; if (Auth.user) { await refreshAccount(); if (Auth.user) this.redemptions = (await api.get('/redemptions')).redemptions || []; } }
      catch (e) { this.error = e.message; } finally { this.loading = false; }
    },
    ask(prize) { if (!Auth.user) { loginFor('/points'); return; } if (prize.stock <= 0) return; if (Auth.user.points < prize.costPoints) { FM.toast('还差 ' + (prize.costPoints - Auth.user.points) + ' 积分，完成预约可攒积分', 'danger'); return; } this.target = prize; },
    async confirm() {
      if (this.busy || !this.target) return; this.busy = true;
      try { await api.post('/redemptions', { prizeId: this.target.id }); this.target = null; await refreshAccount(); FM.toast('兑换成功，请到门店领取'); await this.load(); }
      catch (e) { FM.toast(e.message, 'danger'); } finally { this.busy = false; }
    },
  },
  template: `<div><ct-header title="积分兑换" subtitle="每一份喜欢，都有回礼"><button class="ct-text-button" @click="Auth.user ? navigate('/points/logs') : navigate('/auth?from=%2Fpoints%2Flogs')">积分明细<ct-icon name="chevron-right"/></button></ct-header><div class="fm-section"><section class="ct-points-banner"><div><span>我的可用积分</span><b>{{ Auth.user ? Auth.user.points : '登录后查看' }}</b><p>预约订单完成后，每消费 1 元积 1 分</p></div><ct-icon name="gift"/><button v-if="!Auth.user" class="fm-btn fm-btn-ghost fm-btn-sm" @click="navigate('/auth?from=%2Fpoints')">登录攒积分</button></section><div class="ct-section-heading"><h2>小积分，换点小美好</h2></div><ct-error v-if="error" :message="error" @retry="load"/><ct-skeleton v-else-if="loading"/><ct-empty v-else-if="!prizes.length" title="好礼正在准备中" text="下次再来看看，先去挑点新鲜水果吧。" icon="gift"/><template v-else><article class="fm-card ct-prize" v-for="prize in prizes" :key="prize.id"><ct-image class="ct-prize-img" :src="prize.imageUrl" :alt="prize.name"/><div class="ct-prize-main"><h3>{{ prize.name }}</h3><p>{{ prize.description }}</p><div class="ct-prize-foot"><strong>{{ prize.costPoints }}<small> 积分</small></strong><button class="fm-btn fm-btn-sm fm-btn-primary" :disabled="prize.stock <= 0" @click="ask(prize)">{{ prize.stock <= 0 ? '已兑完' : '兑换' }}</button></div><span class="fm-muted">剩余 {{ prize.stock }} 份</span></div></article></template><template v-if="redemptions.length"><div class="ct-section-heading"><h2>我的兑换记录</h2></div><div class="fm-list"><div class="fm-row" v-for="item in redemptions" :key="item.id"><div class="fm-row-main"><p class="fm-row-title">{{ item.prizeName }}</p><p class="fm-row-desc">{{ item.createdAt }} / {{ item.costPoints }} 积分</p></div><span class="fm-badge" :class="item.status === 'done' ? 'is-ok' : (item.status === 'cancelled' ? 'is-muted' : 'is-warn')">{{ item.statusText }}</span></div></div></template></div><ct-confirm v-if="target" title="把这份好礼带回家？" :busy="busy" @close="target = null" @confirm="confirm"><p>使用 <b>{{ target.costPoints }} 积分</b>兑换「{{ target.name }}」。</p><p class="fm-muted">兑换成功后，请到门店凭手机号领取。</p></ct-confirm></div>`,
};

const CtLedger = {
  data() { return { logs: [], loading: true, error: '', filter: 'all', Auth }; },
  computed: { filteredLogs() { return this.logs.filter(log => this.filter === 'all' || (this.filter === 'in' ? log.change > 0 : log.change < 0)); } },
  created() { this.load(); },
  methods: { ...common, async load() { this.loading = true; this.error = ''; try { const data = await loadAccount(); if (data) this.logs = data.pointsLogs || []; } catch (e) { this.error = e.message; } finally { this.loading = false; } } },
  template: `<div><ct-header title="积分明细" back="/points"/><div class="fm-section"><section class="ct-points-banner"><span>当前可用积分</span><b>{{ Auth.user ? Auth.user.points : 0 }}</b><p>每一次消费，都为喜欢攒一点</p></section><div class="fm-chips ct-ledger-filters"><button v-for="item in [['all','全部'],['in','收入'],['out','支出']]" :key="item[0]" :class="['fm-chip', {active: filter === item[0]}]" :aria-pressed="filter === item[0]" @click="filter = item[0]">{{ item[1] }}</button></div><ct-error v-if="error" :message="error" @retry="load"/><ct-skeleton v-else-if="loading"/><ct-empty v-else-if="!filteredLogs.length" title="暂无这类积分记录" text="完成预约订单后，积分会自动到账。" icon="receipt"/><div v-else class="fm-list"><div class="fm-row" v-for="log in filteredLogs" :key="log.id"><span class="ct-log-icon"><ct-icon :name="log.change > 0 ? 'plus' : 'minus'"/></span><div class="fm-row-main"><p class="fm-row-title">{{ log.reason }}</p><p class="fm-row-desc">{{ log.createdAt }}</p></div><b :class="log.change > 0 ? 'ct-up' : 'ct-down'">{{ log.change > 0 ? '+' : '' }}{{ log.change }}</b></div></div><p class="fm-hint ct-center" v-if="!loading && !error">展示接口返回的最近 {{ logs.length }} 条积分记录</p></div></div>`,
};
const CtMe = {
  data() { return { Auth, logs: [], nickname: '', loading: true, error: '', saving: false, target: false, busy: false }; },
  created() { this.load(); },
  methods: {
    ...common,
    async load() { this.loading = true; this.error = ''; try { const data = await loadAccount(); if (data) { this.nickname = data.user.nickname; this.logs = data.balanceLogs || []; } } catch (e) { this.error = e.message; } finally { this.loading = false; } },
    async saveNickname() { if (this.saving) return; if (!this.nickname.trim()) { FM.toast('请填写昵称', 'danger'); return; } this.saving = true; try { const token = Auth.token; const data = await api.post('/auth/profile', { nickname: this.nickname.trim() }); if (Auth.token !== token) return; accountRequest++; Auth.user = data.user; FM.toast('昵称已更新'); } catch (e) { FM.toast(e.message, 'danger'); } finally { this.saving = false; } },
    async logout() { if (this.busy) return; this.busy = true; await api.logout(); recordOrders([]); this.target = false; FM.toast('已退出登录'); router.navigate('/'); },
  },
  template: `<div><ct-header title="我的" subtitle="和新鲜，常常见面"/><div class="fm-section"><ct-error v-if="error" :message="error" @retry="load"/><ct-skeleton v-else-if="loading"/><template v-else-if="Auth.user"><section class="ct-me-head"><div class="ct-avatar">{{ (Auth.user.nickname || '果').slice(0,1) }}</div><div><h2>{{ Auth.user.nickname || '果友' }}</h2><p>{{ Auth.user.phone }}</p></div><span class="ct-member-label">鲜果会员</span></section><section class="ct-wallet"><div><span>账户余额（元）</span><b>{{ fmtMoney(Auth.user.balanceCents) }}</b></div><button @click="navigate('/points/logs')"><span>我的积分<ct-icon name="chevron-right"/></span><b>{{ Auth.user.points }}</b></button></section><button class="ct-account-link" @click="navigate('/orders')"><ct-icon name="calendar-event"/><span>我的预约<small>查看预约与取货进度</small></span><ct-icon name="chevron-right"/></button><form class="fm-card ct-profile" @submit.prevent="saveNickname"><h3 class="fm-card-title">资料设置</h3><label class="fm-label" for="ct-nickname">昵称</label><div class="ct-nickname-row"><input id="ct-nickname" class="fm-input" v-model.trim="nickname" maxlength="16" required><button class="fm-btn fm-btn-primary" :disabled="saving" type="submit">{{ saving ? '保存中…' : '保存' }}</button></div></form><div class="ct-section-heading"><h2>余额流水</h2></div><ct-empty v-if="!logs.length" title="暂无余额变动" text="充值与余额支付的记录会显示在这里。" icon="receipt"/><div v-else class="fm-list"><div class="fm-row" v-for="log in logs" :key="log.id"><div class="fm-row-main"><p class="fm-row-title">{{ log.reason }}</p><p class="fm-row-desc">{{ log.createdAt }} / {{ log.operator || '系统' }}</p></div><b :class="log.changeCents > 0 ? 'ct-up' : 'ct-down'">{{ log.changeCents > 0 ? '+' : '' }}{{ fmtMoney(log.changeCents) }}</b></div></div><p class="fm-hint ct-center">展示最近 {{ logs.length }} 条余额记录</p><button class="ct-logout" @click="target = true"><ct-icon name="logout"/>退出登录</button></template></div><ct-confirm v-if="target" title="退出当前账户？" :busy="busy" @close="target = false" @confirm="logout"><p class="fm-muted">退出后仍可浏览水果，预约和兑换时需要重新登录。</p></ct-confirm></div>`,
};
const CtAuth = {
  data() { return { mode: 'login', form: { phone: '', password: '', confirm: '', nickname: '' }, submitting: false, showPassword: false }; },
  methods: {
    ...common,
    fill() { this.form.phone = '13900000001'; this.form.password = '123456'; },
    async submit() {
      if (this.submitting) return;
      if (!/^1\d{10}$/.test(this.form.phone)) { FM.toast('请输入正确的 11 位手机号', 'danger'); return; }
      if (this.form.password.length < 6) { FM.toast('密码至少为 6 位', 'danger'); return; }
      if (this.mode === 'register' && this.form.password !== this.form.confirm) { FM.toast('两次输入的密码不一致', 'danger'); return; }
      this.submitting = true;
      // 门槛内直接展示登录页时，回到原来访问的受保护路由。
      const destination = R.query.from || (R.path !== '/auth' ? R.path : '/');
      try {
        if (this.mode === 'login') await api.login(this.form.phone, this.form.password);
        else await api.register(this.form.phone, this.form.password, this.form.nickname);
        FM.toast(this.mode === 'login' ? '欢迎回来，今天也要吃点水果' : '注册成功，欢迎成为果友');
        router.navigate(destination.startsWith('/') && resolve(destination).route.name !== 'auth' ? destination : '/');
      } catch (e) { FM.toast(e.message, 'danger'); } finally { this.submitting = false; }
    },
  },
  template: `<div><ct-header title="果子来了" back="/"/><main class="ct-auth"><div class="ct-auth-brand"><ct-icon name="leaf"/></div><span class="ct-eyebrow">新鲜生活，从这里开始</span><h2>{{ mode === 'login' ? '好久不见，果友。' : '欢迎成为果友。' }}</h2><p class="ct-auth-sub">登录后预约鲜果，把每一份喜欢攒成积分。</p><div class="ct-auth-tabs"><button :class="{active: mode === 'login'}" @click="mode = 'login'" :disabled="submitting" :aria-pressed="mode === 'login'">会员登录</button><button :class="{active: mode === 'register'}" @click="mode = 'register'" :disabled="submitting" :aria-pressed="mode === 'register'">注册账户</button></div><form @submit.prevent="submit"><div class="fm-field"><label class="fm-label" for="ct-phone">手机号</label><input id="ct-phone" class="fm-input" type="tel" inputmode="numeric" autocomplete="tel" pattern="1[0-9]{10}" maxlength="11" v-model.trim="form.phone" placeholder="请输入 11 位手机号" required></div><div class="fm-field" v-if="mode === 'register'"><label class="fm-label" for="ct-register-name">昵称（选填）</label><input id="ct-register-name" class="fm-input" maxlength="16" autocomplete="nickname" v-model.trim="form.nickname" placeholder="怎么称呼你？"></div><div class="fm-field"><label class="fm-label" for="ct-password">密码</label><div class="ct-password"><input id="ct-password" class="fm-input" :type="showPassword ? 'text' : 'password'" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" minlength="6" v-model="form.password" placeholder="至少 6 位密码" required><button type="button" @click="showPassword = !showPassword" :aria-pressed="showPassword">{{ showPassword ? '隐藏' : '显示' }}</button></div></div><div class="fm-field" v-if="mode === 'register'"><label class="fm-label" for="ct-confirm-password">确认密码</label><input id="ct-confirm-password" class="fm-input" type="password" autocomplete="new-password" minlength="6" v-model="form.confirm" placeholder="再次输入密码" required></div><button class="fm-btn fm-btn-primary fm-btn-block fm-btn-lg" :disabled="submitting" type="submit">{{ submitting ? '提交中…' : (mode === 'login' ? '登录，开启鲜果时刻' : '注册并登录') }}<ct-icon name="arrow-right"/></button></form><button class="ct-guest" @click="navigate('/')">先逛逛鲜果<ct-icon name="arrow-right"/></button><details class="ct-demo"><summary>演示账户</summary><p>13900000001 / 123456</p><button class="fm-btn fm-btn-sm" @click="fill">填入演示账号</button></details></main></div>`,
};
const TABS = [{ path: '/', label: '首页', icon: 'home' }, { path: '/orders', label: '预约', icon: 'calendar-event' }, { path: '/points', label: '积分', icon: 'gift' }, { path: '/me', label: '我的', icon: 'user' }];
const App = {
  data() { return { Auth, R, Alerts, resolved: { route: ROUTES[0], params: {} }, tabs: TABS, polling: false }; },
  computed: {
    view() { return this.resolved.route.auth && !Auth.user ? 'ct-auth' : this.resolved.route.view; },
    showTab() { return TABS.some(t => t.path === R.path); },
    authKey() { return Auth.user ? String(Auth.user.id || Auth.user.phone) : ''; },
  },
  watch: { authKey() { recordOrders([]); this.pollOrders(); } },
  created() { router.onStart(r => { this.resolved = resolve(r.path); window.scrollTo(0, 0); }); },
  mounted() { this.pollOrders(); this.timer = setInterval(this.pollOrders, 30000); this.visibilityHandler = () => { if (!document.hidden) this.pollOrders(); }; document.addEventListener('visibilitychange', this.visibilityHandler); },
  beforeUnmount() { clearInterval(this.timer); document.removeEventListener('visibilitychange', this.visibilityHandler); },
  methods: {
    go: router.navigate,
    async pollOrders() {
      if (!Auth.user || document.hidden || this.polling) return;
      const key = this.authKey; this.polling = true;
      try { const data = await api.get('/orders'); if (this.authKey === key) recordOrders(data.orders || []); } catch (_) { /* 后台提醒失败不影响页面 */ }
      finally { this.polling = false; }
    },
  },
  template: `<div class="fm-app ct-app"><div class="fm-body"><transition name="ct-page" mode="out-in"><component :is="view" v-bind="resolved.params" :key="R.path + ':' + view"/></transition></div><nav class="fm-tabbar ct-tabbar" v-if="showTab" aria-label="主导航"><button v-for="tab in tabs" :key="tab.path" :class="['fm-tab', {active: R.path === tab.path}]" :aria-current="R.path === tab.path ? 'page' : undefined" @click="go(tab.path)"><span class="ct-tab-icon"><ct-icon :name="tab.icon"/><span v-if="tab.path === '/orders' && Alerts.ids.length" class="ct-tab-badge" :aria-label="Alerts.ids.length + ' 条预约状态更新'">{{ Alerts.ids.length > 9 ? '9+' : Alerts.ids.length }}</span></span><span>{{ tab.label }}</span></button></nav></div>`,
};
(async function main() {
  await api.loadMe();
  const app = Vue.createApp(App);
  Object.entries({ 'ct-icon': CtIcon, 'ct-header': CtHeader, 'ct-image': CtImage, 'ct-skeleton': CtSkeleton, 'ct-empty': CtEmpty, 'ct-error': CtError, 'ct-confirm': CtConfirm,
    'ct-home': CtHome, 'ct-detail': CtDetail, 'ct-orders': CtOrders, 'ct-order-detail': CtOrderDetail, 'ct-points': CtPoints, 'ct-ledger': CtLedger, 'ct-me': CtMe, 'ct-auth': CtAuth }).forEach(([name, component]) => app.component(name, component));
  app.mount('#app');
})();
=======
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
>>>>>>> 3d1cee76a7f583f06183eb5f419837fb946fd2c1
