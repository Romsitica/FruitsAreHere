/* ============================================================================
 * 商户端 APP · 入口脚本
 * ----------------------------------------------------------------------------
 * 责任组员：商户端前端（移动端商户 APP）
 * 归属目录：mobile/merchant/**            ← 只改这个目录里的文件
 * 只读依赖：mobile/shared/api.js、mobile/shared/theme.css（共享层，不要改）
 *
 * 已完成（可直接跑通）：商户登录、经营概览（6 项指标）、预约订单流转（确认/完成/取消）、
 *                     商品新增/编辑/上下架（含主图拍照、预览与直链）、商品分类筛选、
 *                     会员余额与积分流水、公告与奖品只读列表
 * 待办：见文件末尾 TODO 清单
 * ==========================================================================*/
const api = FM.createClient({ tokenKey: 'fm_merchant_token' });
const Auth = api.state;

const router = FM.createRouter('/');
const R = router.state;

/* ------------------------------------------------------------ 路由表 */
const ROUTES = [
  { name: 'overview', re: /^\/$/,         view: 'mc-overview' },
  { name: 'orders',   re: /^\/orders$/,   view: 'mc-orders' },
  { name: 'products', re: /^\/products$/, view: 'mc-products' },
  { name: 'members',  re: /^\/members$/,  view: 'mc-members' },
  { name: 'more',     re: /^\/more$/,     view: 'mc-more' },
  { name: 'auth',     re: /^\/auth$/,     view: 'mc-auth' },
];

const TABS = [
  { path: '/', label: '概览', icon: '\u{1F4CA}' },
  { path: '/orders', label: '订单', icon: '\u{1F9FE}' },
  { path: '/products', label: '商品', icon: '\u{1F34E}' },
  { path: '/members', label: '会员', icon: '\u{1F465}' },
  { path: '/more', label: '更多', icon: '\u{2699}\u{FE0F}' },
];

function resolve(path) {
  for (const route of ROUTES) {
    if (route.re.test(path)) return { route, params: {} };
  }
  return { route: ROUTES[0], params: {} };
}

const ORDER_TABS = [
  ['pending', '待确认'], ['confirmed', '已确认'], ['completed', '已完成'],
  ['cancelled', '已取消'], ['all', '全部'],
];

const STATUS_CLASS = {
  pending: 'is-warn', confirmed: 'is-info', completed: 'is-ok', cancelled: 'is-muted',
};

/* 后端 shop/api.py 的 MAX_PRODUCT_IMAGES，超出会直接 400，这里用来提前拦住 */
const MAX_IMAGES = 6;

/* ============================================================ 经营概览 */
const McOverview = {
  data() { return { Auth, stats: null, pending: [], loading: true, days: 7 }; },
  computed: {
    trendRows() { return (this.stats && this.stats.revenueTrend) || []; },
    trendMax() { return this.trendRows.reduce((m, d) => Math.max(m, Number(d.salesCents) || 0), 0); },
    trendTotal() { return this.trendRows.reduce((s, d) => s + (Number(d.salesCents) || 0), 0); },
  },
  created() { this.load(); },
  methods: {
    fmtMoney: FM.fmtMoney,
    go(path) { router.navigate(path); },
    setDays(n) { if (this.days === n) return; this.days = n; this.load(); },
    /* 柱高用 px 而不是百分比：flex 容器里的百分比高度在部分安卓 WebView 会塌成 0 */
    barPx(d) {
      const v = Number(d.salesCents) || 0;
      if (!v) return '2px';
      return Math.max(4, Math.round(v / (this.trendMax || 1) * 84)) + 'px';
    },
    async load() {
      this.loading = true;
      try {
        const [stats, orders] = await Promise.all([
          api.get('/merchant/stats?days=' + this.days),
          api.get('/orders?status=pending'),
        ]);
        this.stats = stats.stats;
        this.pending = orders.orders.slice(0, 5);
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },
  },
  template: `
  <div>
    <header class="fm-navbar">
      <div class="fm-navbar-title">经营概览<span class="fm-navbar-sub">{{ Auth.user ? Auth.user.nickname : '' }}</span></div>
      <div class="fm-navbar-actions"><button class="fm-btn fm-btn-sm" @click="load">刷新</button></div>
    </header>
    <div v-if="loading" class="fm-section">
      <div class="fm-skeleton" v-for="n in 4" :key="n"></div>
    </div>
    <template v-else-if="stats">
      <div class="fm-section">
        <div class="mc-todo" :class="{ 'is-clear': !stats.pendingCount }">
          <div class="mc-todo-main">
            <span class="mc-todo-label">待确认预约</span>
            <b class="mc-todo-num">{{ stats.pendingCount }}<em>笔</em></b>
            <p class="mc-todo-desc" v-if="stats.pendingCount">顾客在会员端下单后在这里等你确认，确认后可到店取货</p>
            <p class="mc-todo-desc" v-else>暂时没有待确认的预约，今天的单都处理完了</p>
          </div>
          <button v-if="stats.pendingCount" class="fm-btn fm-btn-sm fm-btn-primary" @click="go('/orders')">去处理</button>
        </div>

        <div class="mc-metrics">
          <div class="mc-metric"><span>累计营收</span><b :class="{ 'is-zero': !stats.salesCents }">{{ fmtMoney(stats.salesCents) }}</b></div>
          <div class="mc-metric"><span>已完成订单</span><b :class="{ 'is-zero': !stats.completedCount }">{{ stats.completedCount }}</b></div>
          <div class="mc-metric"><span>会员数量</span><b :class="{ 'is-zero': !stats.memberCount }">{{ stats.memberCount }}</b></div>
          <div class="mc-metric"><span>在售商品</span><b :class="{ 'is-zero': !stats.productOnCount }">{{ stats.productOnCount }}</b></div>
          <div class="mc-metric"><span>累计发放积分</span><b :class="{ 'is-zero': !stats.pointsIssued }">{{ stats.pointsIssued }}</b></div>
        </div>
      </div>

      <div class="fm-block-title" v-if="pending.length">待处理明细</div>
      <div class="fm-section" v-if="pending.length">
        <div class="fm-list">
          <div class="fm-row" v-for="order in pending" :key="order.id">
            <div class="fm-row-main">
              <p class="fm-row-title">{{ order.productName }} × {{ order.quantity }}</p>
              <p class="fm-row-desc">{{ order.memberName }} · {{ order.memberPhone }} · {{ order.pickupTime || '时间不限' }}</p>
            </div>
            <div class="fm-row-side"><b class="fm-price-sm">{{ fmtMoney(order.totalCents) }}</b></div>
          </div>
        </div>
      </div>

      <div class="fm-block-title">营收趋势
        <span class="mc-seg">
          <button :class="['mc-seg-btn', days === 7 ? 'is-on' : '']" @click="setDays(7)">7 天</button>
          <button :class="['mc-seg-btn', days === 30 ? 'is-on' : '']" @click="setDays(30)">30 天</button>
        </span>
      </div>
      <div class="fm-section">
        <div class="fm-card">
          <div class="mc-trend" :class="{ 'mc-trend--dense': days === 30 }"
               role="img" :aria-label="days + ' 天营收趋势，合计 ' + fmtMoney(trendTotal)">
            <div class="mc-trend-col" v-for="(d, i) in trendRows" :key="d.date">
              <span class="mc-trend-track">
                <span class="mc-trend-bar" :style="{ height: barPx(d) }"></span>
              </span>
              <span class="mc-trend-x">{{ days === 30 && i % 5 !== 0 ? '' : d.date.slice(5) }}</span>
            </div>
          </div>
          <p class="mc-hint">
            {{ days }} 天合计 {{ fmtMoney(trendTotal) }}
            <span v-if="!trendTotal">· 这段时间还没有已完成订单，订单完成后才计入营收</span>
          </p>
        </div>
      </div>

      <div class="fm-block-title">热销商品</div>
      <div class="fm-section">
        <div class="fm-list">
          <div class="fm-row" v-for="item in stats.topProducts" :key="item.id">
            <div class="fm-row-main">
              <p class="fm-row-title">{{ item.name }}</p>
              <p class="fm-row-desc">剩余库存 {{ item.stock }}</p>
            </div>
            <div class="fm-row-side"><b>已售 {{ item.sales }}</b></div>
          </div>
          <div class="fm-row" v-if="!stats.topProducts.length"><div class="fm-row-main"><p class="fm-row-desc">暂无销售数据</p></div></div>
        </div>
      </div>
    </template>
  </div>`,
};

/* ============================================================ 预约订单 */
const McOrders = {
  data() { return { orders: [], status: 'pending', keyword: '', dateFrom: '', dateTo: '', showDate: false, loading: true, detail: null, tabs: ORDER_TABS, pickMode: false, selected: [], batchBusy: false }; },
  created() { this.load(); },
  computed: {
    /* 按日期把订单分组：iOS 的列表习惯把同一天的东西收在一起，比一条平铺到底好扫读。
       分组只用订单自己的 createdAt，不改接口、不改排序。 */
    groups() {
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const now = new Date();
      const today = dayKey(now);
      const yesterday = dayKey(new Date(now.getTime() - 86400000));
      const out = [];
      const index = {};
      (this.orders || []).forEach((o) => {
        const key = String(o.createdAt || '').slice(0, 10) || '未知日期';
        if (!index[key]) {
          let label = key;
          if (key === today) label = '今天';
          else if (key === yesterday) label = '昨天';
          else if (key.length === 10) label = Number(key.slice(5, 7)) + ' 月 ' + Number(key.slice(8, 10)) + ' 日';
          index[key] = { key: key, label: label, items: [] };
          out.push(index[key]);
        }
        index[key].items.push(o);
      });
      return out;
    },
  },
  methods: {
    fmtMoney: FM.fmtMoney,
    statusClass(s) { return STATUS_CLASS[s] || 'is-muted'; },
    clearDates() { this.dateFrom = ''; this.dateTo = ''; this.load(); },
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams({ status: this.status });
        if (this.keyword) q.set('keyword', this.keyword);
        /* 日期区间走服务端筛选（后端按 YYYY-MM-DD 解析，含首尾两天） */
        if (this.dateFrom) q.set('dateFrom', this.dateFrom);
        if (this.dateTo) q.set('dateTo', this.dateTo);
        this.orders = (await api.get('/orders?' + q.toString())).orders;
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },
    async change(order, status, label) {
      if (!window.confirm('将订单 ' + order.orderNo + ' 标记为「' + label + '」？')) return;
      try {
        await api.post('/merchant/orders/' + order.id + '/status', { status });
        FM.toast('已' + label);
        this.detail = null;
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      }
    },

    /* ------------------------------------------------ 批量处理
     * 后端只有单条接口 POST /merchant/orders/<id>/status，
     * 所以批量是「前端多选 + 逐条循环」，任何一条失败都不影响其它条，
     * 最后汇总告诉店主成功几笔、失败几笔。
     */
    enterPick() { this.pickMode = true; this.selected = []; this.detail = null; },
    exitPick() { this.pickMode = false; this.selected = []; },
    isPicked(order) { return this.selected.indexOf(order.id) >= 0; },
    togglePick(order) {
      const i = this.selected.indexOf(order.id);
      if (i >= 0) this.selected.splice(i, 1);
      else this.selected.push(order.id);
    },
    /** 按后端规则判断某单能否流转到目标状态，避免必然失败的请求 */
    eligibleFor(order, status) {
      if (status === 'confirmed') return order.status === 'pending';
      return order.status === 'pending' || order.status === 'confirmed';
    },
    selectAll() {
      const ids = this.orders
        .filter((o) => this.eligibleFor(o, 'confirmed') || this.eligibleFor(o, 'completed'))
        .map((o) => o.id);
      this.selected = ids;
      if (!ids.length) FM.toast('当前列表没有可批量处理的订单', 'danger');
    },
    async batch(status, label) {
      if (this.batchBusy) return;
      const picked = this.orders.filter((o) => this.selected.indexOf(o.id) >= 0 && this.eligibleFor(o, status));
      if (!picked.length) {
        FM.toast('选中的订单当前状态不能「' + label + '」', 'danger');
        return;
      }
      if (!window.confirm('将选中的 ' + picked.length + ' 笔订单批量' + label + '？')) return;

      this.batchBusy = true;
      let done = 0;
      let firstError = '';
      for (const order of picked) {
        try {
          await api.post('/merchant/orders/' + order.id + '/status', { status });
          done += 1;
        } catch (e) {
          if (!firstError) firstError = e.message;
        }
      }
      this.batchBusy = false;

      if (done) FM.toast('已' + label + ' ' + done + ' 笔');
      if (done < picked.length) {
        FM.toast((picked.length - done) + ' 笔失败' + (firstError ? '：' + firstError : ''), 'danger');
      }
      this.exitPick();
      this.load();
    },
    /** 切换状态标签时清空多选，避免把上一页的单子带过去 */
    switchStatus(value) { this.status = value; this.exitPick(); this.load(); },
  },
  template: `
  <div>
    <header class="fm-navbar">
      <div class="fm-navbar-title">预约订单</div>
      <div class="fm-navbar-actions">
        <button v-if="!pickMode" :class="['fm-btn', 'fm-btn-sm', (dateFrom || dateTo) ? 'fm-btn-ghost' : '']"
                @click="showDate = !showDate">筛选</button>
        <button v-if="!pickMode" class="fm-btn fm-btn-sm" @click="enterPick">批量</button>
        <button v-else class="fm-btn fm-btn-sm fm-btn-primary" @click="exitPick">退出批量</button>
      </div>
    </header>
    <div class="fm-chips">
      <button v-for="item in tabs" :key="item[0]" :class="['fm-chip', status === item[0] ? 'active' : '']"
              @click="switchStatus(item[0])">{{ item[1] }}</button>
    </div>

    <div class="mc-batch-bar" v-if="pickMode">
      <button class="fm-btn fm-btn-sm" @click="selectAll">全选</button>
      <span class="mc-batch-count">已选 {{ selected.length }} 笔</span>
      <button class="fm-btn fm-btn-sm fm-btn-primary" :disabled="batchBusy"
              @click="batch('confirmed', '确认')">{{ batchBusy ? '处理中…' : '批量确认' }}</button>
      <button class="fm-btn fm-btn-sm mc-act" :disabled="batchBusy"
              @click="batch('completed', '完成')">批量完成</button>
    </div>
    <form class="fm-section mc-search" @submit.prevent="load">
      <input class="fm-input" v-model.trim="keyword" placeholder="订单号 / 商品 / 手机号">
      <button class="fm-btn" type="submit">搜索</button>
    </form>
    <!-- 日期筛选：默认收起，避免首屏被筛选控件占满 -->
    <div class="fm-section mc-daterow" v-if="showDate">
      <input class="fm-input" type="date" v-model="dateFrom" @change="load" aria-label="开始日期">
      <span class="mc-daterow-sep">至</span>
      <input class="fm-input" type="date" v-model="dateTo" @change="load" aria-label="结束日期">
      <button v-if="dateFrom || dateTo" class="fm-btn fm-btn-sm mc-act" @click="clearDates">清除</button>
    </div>

    <div class="fm-section">
      <div v-if="loading" class="fm-section">
        <div class="fm-skeleton" v-for="n in 4" :key="n"></div>
      </div>
      <div v-else-if="!orders.length" class="fm-empty">
        <div class="fm-empty-ring"></div>
        <p>这个状态下还没有订单</p>
        <p>切换上方的状态标签，可以查看其他状态的订单</p>
      </div>
      <div v-else>
        <template v-for="group in groups" :key="group.key">
          <div class="mc-group">
            <span class="mc-group-label">{{ group.label }}</span>
            <span class="mc-group-count">{{ group.items.length }} 笔</span>
          </div>
          <div class="fm-card mc-order" v-for="order in group.items" :key="order.id"
               :class="{ 'mc-card--picked': pickMode && isPicked(order) }"
               @click="pickMode ? togglePick(order) : (detail = order)">
            <div class="mc-order-head">
              <span class="mc-pick" v-if="pickMode" :class="{ 'is-on': isPicked(order) }">{{ isPicked(order) ? '✓' : '' }}</span>
              <b class="mc-order-no">{{ order.orderNo }}</b>
              <span class="fm-badge" :class="statusClass(order.status)">{{ order.statusText }}</span>
            </div>
            <p class="mc-order-name">{{ order.productName }}<span class="mc-order-qty">× {{ order.quantity }}</span></p>
            <p class="mc-order-sub">{{ order.memberName }} · {{ order.memberPhone }}</p>
            <p class="mc-order-sub"><span class="mc-order-when">{{ order.pickupTime || '时间不限' }}</span> · {{ order.payMethod === 'balance' ? '余额支付' : '到店支付' }}</p>
            <div class="mc-order-foot">
              <span class="mc-order-price">{{ fmtMoney(order.totalCents) }}</span>
              <span class="mc-order-actions">
                <button v-if="order.status === 'pending'" class="fm-btn fm-btn-sm fm-btn-primary"
                        @click.stop="change(order, 'confirmed', '确认')">确认</button>
                <!-- 每张卡只留一颗实心按钮：待确认时是「确认」，已确认时换成「完成」 -->
                <button v-if="order.status === 'pending' || order.status === 'confirmed'"
                        :class="['fm-btn', 'fm-btn-sm', order.status === 'confirmed' ? 'fm-btn-primary' : 'mc-act']"
                        @click.stop="change(order, 'completed', '完成')">完成</button>
                <button v-if="order.status === 'pending' || order.status === 'confirmed'" class="fm-btn fm-btn-sm mc-act is-danger"
                        @click.stop="change(order, 'cancelled', '取消')">取消</button>
              </span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="fm-mask" v-if="detail" @click="detail = null"></div>
    <div class="fm-sheet" v-if="detail">
      <h3 class="fm-sheet-title">订单详情</h3>
      <div class="fm-kv"><span>订单号</span><b>{{ detail.orderNo }}</b></div>
      <div class="fm-kv"><span>会员</span><b>{{ detail.memberName }}（{{ detail.memberPhone }}）</b></div>
      <div class="fm-kv"><span>商品</span><b>{{ detail.productName }} × {{ detail.quantity }}</b></div>
      <div class="fm-kv"><span>单价</span><b>{{ fmtMoney(detail.unitPriceCents) }}</b></div>
      <div class="fm-kv"><span>订单金额</span><b>{{ fmtMoney(detail.totalCents) }}</b></div>
      <div class="fm-kv"><span>支付方式</span><b>{{ detail.payMethod === 'balance' ? '余额支付（已扣款）' : '到店支付' }}</b></div>
      <div class="fm-kv"><span>预约取货</span><b>{{ detail.pickupTime || '时间不限' }}</b></div>
      <div class="fm-kv"><span>会员备注</span><b>{{ detail.note || '无' }}</b></div>
      <div class="fm-kv"><span>下单时间</span><b>{{ detail.createdAt }}</b></div>
      <div class="fm-kv"><span>已发积分</span><b>{{ detail.pointsGained || 0 }}</b></div>
      <div class="fm-sheet-foot"><button class="fm-btn fm-btn-block" @click="detail = null">关闭</button></div>
    </div>
  </div>`,
};

/* ============================================================ 商品管理 */
const McProducts = {
  data() {
    return {
      products: [], categories: [], keyword: '', category: '', loading: true,
      formOpen: false, mode: 'create', form: null, errors: {}, saving: false,
      uploading: false, urlDraft: '', maxImages: MAX_IMAGES,
    };
  },
  created() { this.load(); },
  computed: {
    formTitle() { return this.mode === 'create' ? '新增商品' : '编辑商品'; },
    /* 顶部汇总：在售 / 下架 / 缺货，让店主一眼知道库存健康度，不用逐张卡去数 */
    summary() {
      const list = this.products || [];
      const on = list.filter((p) => p.status === 'on').length;
      return {
        total: list.length,
        on: on,
        off: list.length - on,
        out: list.filter((p) => Number(p.stock) <= 0).length,
      };
    },
  },
  methods: {
    fmtMoney: FM.fmtMoney,
    centsToYuan: FM.centsToYuan,
    yuanToCents: FM.yuanToCents,
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams({ scope: 'all' });
        if (this.keyword) q.set('keyword', this.keyword);
        if (this.category) q.set('category', this.category);
        const data = await api.get('/products?' + q.toString());
        this.products = data.products;
        this.categories = data.categories || [];
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },

    /** 点分类 chip 筛选；传空串表示全部 */
    pickCategory(name) { this.category = name; this.load(); },

    /* -------------------------------------------- 新增 / 编辑 共用表单 */
    blankForm() {
      return {
        id: null, name: '', category: '时令鲜果', priceYuan: '', originPriceYuan: '',
        unit: '份', stock: 0, status: 'on', description: '', images: [],
      };
    },
    openCreate() {
      this.mode = 'create';
      this.form = this.blankForm();
      this.errors = {};
      this.urlDraft = '';
      this.formOpen = true;
    },
    openEdit(product) {
      this.mode = 'edit';
      /* 后端同时保留了 imageUrl（封面）与 images（图集）。
         老商品只有封面没有图集，这里把封面当作第一张，避免点开编辑看不到图。 */
      const gallery = Array.isArray(product.images) && product.images.length
        ? product.images.slice()
        : (product.imageUrl ? [product.imageUrl] : []);
      this.form = {
        id: product.id,
        name: product.name,
        category: product.category,
        priceYuan: this.centsToYuan(product.priceCents),
        originPriceYuan: product.originPriceCents ? this.centsToYuan(product.originPriceCents) : '',
        unit: product.unit,
        stock: product.stock,
        status: product.status,
        description: product.description || '',
        images: gallery.slice(0, 6),
      };
      this.errors = {};
      this.urlDraft = '';
      this.formOpen = true;
    },
    closeForm() {
      if (this.saving || this.uploading) return;
      this.formOpen = false;
      this.form = null;
      this.errors = {};
      this.urlDraft = '';
    },

    /* -------------------------------------------- 前端校验（后端还会再校验一次） */
    validate() {
      const f = this.form;
      const errors = {};
      const name = String(f.name || '').trim();
      if (!name) errors.name = '请填写商品名称';
      else if (name.length > 64) errors.name = '名称不能超过 64 个字';

      if (f.priceYuan === '' || f.priceYuan === null || f.priceYuan === undefined || isNaN(Number(f.priceYuan))) {
        errors.priceYuan = '请填写售价';
      } else if (Number(f.priceYuan) < 0) {
        errors.priceYuan = '售价不能为负数';
      }

      if (f.originPriceYuan !== '' && f.originPriceYuan !== null && f.originPriceYuan !== undefined) {
        if (isNaN(Number(f.originPriceYuan)) || Number(f.originPriceYuan) < 0) {
          errors.originPriceYuan = '划线价不能为负数';
        }
      }

      const stockRaw = String(f.stock === null || f.stock === undefined ? '' : f.stock).trim();
      const stock = stockRaw === '' ? 0 : Number(stockRaw);
      if (!Number.isInteger(stock) || stock < 0) errors.stock = '库存必须是 0 或正整数';

      if (String(f.category || '').length > 32) errors.category = '分类不能超过 32 个字';
      if (String(f.unit || '').length > 32) errors.unit = '规格单位不能超过 32 个字';
      if (String(f.description || '').length > 2000) errors.description = '商品详情不能超过 2000 个字';
      /* 图集：最多 6 张，单张地址不超过 512 字符（后端同样会拦，这里先挡住少跑一次网络） */
      const gallery = Array.isArray(f.images) ? f.images : [];
      if (gallery.length > 6) errors.images = '最多只能放 6 张图';
      else if (gallery.some((u) => String(u).trim().length > 512)) errors.images = '单张图片地址不能超过 512 个字符';

      this.errors = errors;
      const count = Object.keys(errors).length;
      if (count) {
        FM.toast('还有 ' + count + ' 处需要修正', 'danger');
        return false;
      }
      return true;
    },

    /* -------------------------------------------- 提交：新增 POST / 编辑 PUT */
    async save() {
      if (!this.validate()) return;
      const f = this.form;
      const stockRaw = String(f.stock === null || f.stock === undefined ? '' : f.stock).trim();
      const payload = {
        name: String(f.name || '').trim(),
        category: String(f.category || '').trim() || '时令鲜果',
        priceCents: this.yuanToCents(f.priceYuan),
        originPriceCents: (f.originPriceYuan === '' || f.originPriceYuan === null || f.originPriceYuan === undefined)
          ? 0 : this.yuanToCents(f.originPriceYuan),
        unit: String(f.unit || '').trim() || '份',
        stock: stockRaw === '' ? 0 : Number(stockRaw),
        status: f.status === 'off' ? 'off' : 'on',
        description: String(f.description || '').trim(),
        /* 图集整体提交。注意：不是每传一张就保存一次 —— 那样后一次会把前一次覆盖掉，
           这是交接文档里特意点出来的坑。这里只在点「保存」时一次性提交。 */
        images: (Array.isArray(f.images) ? f.images : [])
          .map((u) => String(u || '').trim()).filter(Boolean).slice(0, 6),
      };
      payload.imageUrl = payload.images[0] || '';
      this.saving = true;
      try {
        if (this.mode === 'create') {
          await api.post('/merchant/products', payload);
        } else {
          await api.put('/merchant/products/' + f.id, payload);
        }
        FM.toast(this.mode === 'create'
          ? (payload.status === 'on' ? '商品已上架' : '已保存，暂未上架')
          : '商品已更新');
        this.formOpen = false;
        this.form = null;
        this.urlDraft = '';
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.saving = false; }
    },

    /* -------------------------------------------- 图集：拍照 / 相册 / 直链
     * 一次可选多张，逐张上传后追加进 form.images，最多 6 张。
     * 关键：上传只往数组里追加，不写库；点「保存」时才整体提交一次。
     * 交接文档特意提过这个坑——每传一张就保存一次，后一次会把前一次覆盖掉。 */
    async pickImage(event) {
      const input = event.target;
      const files = Array.from(input.files || []);
      input.value = '';                       // 清空，允许连续选同一张图
      if (!files.length) return;

      const room = MAX_IMAGES - this.form.images.length;
      if (room <= 0) { FM.toast('最多 ' + MAX_IMAGES + ' 张，先删掉一张再加', 'danger'); return; }

      let accepted = 0;
      for (const file of files) {
        if (accepted >= room) break;
        if (!/^image\//.test(file.type)) { FM.toast(file.name + ' 不是图片，已跳过', 'danger'); continue; }
        if (file.size > 5 * 1024 * 1024) { FM.toast(file.name + ' 超过 5MB，已跳过', 'danger'); continue; }
        accepted += 1;
        await this.uploadImage(file);         // 串行：一张传完再传下一张
      }
      if (files.length > accepted) {
        FM.toast('最多 ' + MAX_IMAGES + ' 张，多出来的没有添加', 'warning');
      }
    },

    /**
     * 上传单张图片并追加到图集。
     * 注意：共享层的 api.post 会把 body 强制 JSON 序列化，传不了文件，
     * 所以这里用原生 fetch + FormData，并手动带上 Authorization。
     */
    async uploadImage(file) {
      this.uploading = true;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const base = String(api.config.baseUrl || '/api').replace(/\/+$/, '');
        const headers = { Accept: 'application/json' };
        if (api.state.token) headers.Authorization = 'Bearer ' + api.state.token;
        const res = await fetch(base + '/merchant/upload', { method: 'POST', headers: headers, body: fd });

        // 严格校验：不能只看 res.ok —— 未知路径可能返回 405 + HTML，
        // 必须确认拿到的是 { ok: true, url } 这种真响应。
        let data = null;
        try { data = await res.json(); } catch (err) { data = null; }
        if (!res.ok || !data || data.ok !== true || !data.url) {
          throw new Error((data && data.ok === false && data.error) ? data.error : 'NOT_READY');
        }

        if (this.form.images.length >= MAX_IMAGES) return;
        this.form.images.push(data.url);
        FM.toast('已添加第 ' + this.form.images.length + ' 张');
      } catch (e) {
        const msg = String((e && e.message) || '');
        FM.toast(msg === 'NOT_READY'
          ? '上传失败：服务端没有返回图片地址，请重试'
          : msg, 'danger');
      } finally { this.uploading = false; }
    },

    removeImage(index) {
      if (this.saving) return;
      this.form.images.splice(index, 1);
    },

    /** 点缩略图把它提到第一位——第一位就是封面 */
    setCover(index) {
      if (index <= 0 || this.saving) return;
      const list = this.form.images;
      const url = list.splice(index, 1)[0];
      list.unshift(url);
      FM.toast('已设为封面');
    },

    /** 粘贴图片直链后追加到图集 */
    addUrl() {
      const url = String(this.urlDraft || '').trim();
      if (!url) return;
      if (this.form.images.length >= MAX_IMAGES) {
        FM.toast('最多 ' + MAX_IMAGES + ' 张，先删掉一张再加', 'danger');
        return;
      }
      if (url.length > 512) { FM.toast('图片地址不能超过 512 个字符', 'danger'); return; }
      this.form.images.push(url);
      this.urlDraft = '';
    },
    async toggle(product) {
      const next = product.status === 'on' ? 'off' : 'on';
      try {
        await api.post('/products/' + product.id + '/status', { status: next });
        FM.toast(next === 'on' ? '已上架' : '已下架');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },

    /**
     * 删除商品（DELETE /merchant/products/<id>/delete）
     * 不可恢复；已有销售记录的商品会额外提醒——历史订单不会消失，
     * 但商品下架比删除更能保住数据，所以默认把这条建议写进确认框。
     */
    async remove(product) {
      const sold = Number(product.sales) || 0;
      const extra = sold > 0
        ? '\n\n该商品已有 ' + sold + ' 笔销售记录。删除后历史订单仍在，但看不到商品信息了，建议改为「下架」。'
        : '';
      if (!window.confirm('确定删除「' + product.name + '」？\n此操作不可恢复。' + extra)) return;
      try {
        await api.del('/merchant/products/' + product.id + '/delete');
        FM.toast('商品已删除');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },
  },
  template: `
  <div>
    <header class="fm-navbar">
      <div class="fm-navbar-title">商品管理</div>
      <div class="fm-navbar-actions">
        <button class="fm-btn fm-btn-sm fm-btn-primary" @click="openCreate">+ 新增</button>
      </div>
    </header>
    <form class="fm-section mc-search" @submit.prevent="load">
      <input class="fm-input" v-model.trim="keyword" placeholder="商品名称 / 描述关键词">
      <button class="fm-btn" type="submit">搜索</button>
    </form>

    <div class="fm-chips" v-if="categories.length">
      <button :class="['fm-chip', category === '' ? 'active' : '']" @click="pickCategory('')">全部</button>
      <button v-for="name in categories" :key="name"
              :class="['fm-chip', category === name ? 'active' : '']" @click="pickCategory(name)">{{ name }}</button>
    </div>

    <!-- 库存概览：有数据才出现，空店时不显示「0 在售」这种噪音 -->
    <div class="mc-summary" v-if="!loading && summary.total">
      <span class="mc-summary-item"><b>{{ summary.on }}</b>在售</span>
      <span class="mc-summary-item"><b>{{ summary.off }}</b>下架</span>
      <span class="mc-summary-item" :class="{ 'is-alert': summary.out > 0 }"><b>{{ summary.out }}</b>缺货</span>
    </div>

    <div class="fm-section">
      <div v-if="loading" class="fm-section">
        <div class="fm-skeleton" v-for="n in 4" :key="n"></div>
      </div>
      <div v-else-if="!products.length" class="fm-empty">
        <div class="fm-empty-ring"></div>
        <p v-if="keyword || category">没有找到匹配的商品，换个关键词或分类试试</p>
        <template v-else>
          <p>店铺里还没有商品</p>
          <button class="fm-btn fm-btn-sm fm-btn-primary" @click="openCreate">+ 上架第一款水果</button>
        </template>
      </div>
      <div v-else class="fm-card mc-goods" v-for="item in products" :key="item.id">
        <div class="mc-goods-top">
          <img v-if="item.imageUrl" class="mc-goods-img" :src="item.imageUrl" :alt="item.name"
               loading="lazy" @error="item.imageUrl = ''">
          <div v-else class="mc-goods-img mc-goods-img--empty">无图</div>
          <div class="mc-goods-main">
            <div class="mc-goods-head">
              <b>{{ item.name }}</b>
              <span class="fm-badge" :class="item.status === 'on' ? 'is-ok' : 'is-muted'">
                {{ item.status === 'on' ? '在售' : '已下架' }}
              </span>
            </div>
            <p class="mc-goods-meta">{{ item.category }} · {{ item.unit }} · 已售 {{ item.sales }}</p>
            <div class="mc-goods-foot">
              <span class="mc-goods-price">{{ fmtMoney(item.priceCents) }}</span>
              <span class="fm-origin" v-if="item.originPriceCents">{{ fmtMoney(item.originPriceCents) }}</span>
              <span class="mc-stock" :class="{ 'is-low': Number(item.stock) > 0 && Number(item.stock) <= 10, 'is-out': Number(item.stock) <= 0 }">
                {{ Number(item.stock) <= 0 ? '缺货' : (Number(item.stock) <= 10 ? '仅剩 ' + item.stock : '库存 ' + item.stock) }}
              </span>
            </div>
          </div>
        </div>
        <div class="mc-goods-actions">
          <button class="fm-btn fm-btn-sm" @click="openEdit(item)">编辑</button>
          <button class="fm-btn fm-btn-sm mc-act" @click="toggle(item)">{{ item.status === 'on' ? '下架' : '上架' }}</button>
          <button class="fm-btn fm-btn-sm mc-act is-danger" @click="remove(item)">删除</button>
        </div>
      </div>
    </div>

    <div class="fm-mask" v-if="formOpen" @click="closeForm"></div>
    <div class="fm-sheet" v-if="formOpen && form">
      <h3 class="fm-sheet-title">{{ formTitle }}</h3>

      <div class="fm-field">
        <label class="fm-label">商品图集 <span class="mc-label-note">最多 {{ maxImages }} 张，第一张是封面</span></label>
        <div class="mc-gallery" v-if="form">
          <div class="mc-gallery-item" v-for="(url, i) in form.images" :key="url + '@' + i">
            <img :src="url" :alt="'第 ' + (i + 1) + ' 张图'" @click="setCover(i)"
                 :title="i === 0 ? '当前封面' : '点一下设为封面'">
            <span class="mc-gallery-cover" v-if="i === 0">封面</span>
            <button type="button" class="mc-gallery-del" :disabled="saving"
                    :aria-label="'删除第 ' + (i + 1) + ' 张图'" @click.stop="removeImage(i)">×</button>
          </div>
          <!-- 上满 6 张就把添加入口收起来，避免点了报错 -->
          <div class="mc-gallery-add" v-if="form.images.length < maxImages">
            <div class="mc-gallery-add-hint">{{ uploading ? '上传中…' : '添加图片' }}</div>
            <div class="mc-gallery-add-btns">
              <label class="mc-gallery-btn">
                拍照
                <input class="mc-file" type="file" accept="image/*" capture="environment" multiple
                       :disabled="uploading" @change="pickImage">
              </label>
              <label class="mc-gallery-btn">
                相册
                <input class="mc-file" type="file" accept="image/*" multiple
                       :disabled="uploading" @change="pickImage">
              </label>
            </div>
          </div>
        </div>
        <input class="fm-input mc-picker-url" v-model.trim="urlDraft" @change="addUrl" @keyup.enter="addUrl"
               :disabled="!form || form.images.length >= maxImages"
               placeholder="或粘贴图片地址后回车添加">
        <p class="mc-hint">支持 jpg / png / webp / gif，单张不超过 5MB</p>
        <p class="mc-form-error" v-if="errors.images">{{ errors.images }}</p>
      </div>

      <div class="fm-field">
        <label class="fm-label">商品名称 <em class="mc-req">*</em></label>
        <input class="fm-input" v-model.trim="form.name" maxlength="64" placeholder="例：红颜草莓 500g">
        <p class="mc-form-error" v-if="errors.name">{{ errors.name }}</p>
      </div>

      <div class="mc-form-row">
        <div class="fm-field">
          <label class="fm-label">售价（元）<em class="mc-req">*</em></label>
          <input class="fm-input" type="number" step="0.01" min="0" v-model="form.priceYuan" placeholder="0.00">
          <p class="mc-form-error" v-if="errors.priceYuan">{{ errors.priceYuan }}</p>
        </div>
        <div class="fm-field">
          <label class="fm-label">划线价（元）</label>
          <input class="fm-input" type="number" step="0.01" min="0" v-model="form.originPriceYuan" placeholder="选填">
          <p class="mc-form-error" v-if="errors.originPriceYuan">{{ errors.originPriceYuan }}</p>
        </div>
      </div>

      <div class="mc-form-row">
        <div class="fm-field">
          <label class="fm-label">库存</label>
          <input class="fm-input" type="number" min="0" step="1" v-model="form.stock">
          <p class="mc-form-error" v-if="errors.stock">{{ errors.stock }}</p>
        </div>
        <div class="fm-field">
          <label class="fm-label">规格单位</label>
          <input class="fm-input" v-model.trim="form.unit" maxlength="32" placeholder="份 / 斤 / 盒">
          <p class="mc-form-error" v-if="errors.unit">{{ errors.unit }}</p>
        </div>
      </div>

      <div class="fm-field">
        <label class="fm-label">分类</label>
        <input class="fm-input" v-model.trim="form.category" maxlength="32" list="mc-category-list" placeholder="时令鲜果">
        <datalist id="mc-category-list">
          <option v-for="name in categories" :key="name" :value="name"></option>
        </datalist>
        <p class="mc-form-error" v-if="errors.category">{{ errors.category }}</p>
      </div>

      <div class="fm-field">
        <label class="fm-label">上架状态</label>
        <select class="fm-select" v-model="form.status">
          <option value="on">立即上架（客户端可见）</option>
          <option value="off">先存为下架</option>
        </select>
      </div>

      <div class="fm-field">
        <label class="fm-label">商品详情</label>
        <textarea class="fm-textarea" v-model.trim="form.description" maxlength="2000" placeholder="产地、口感、保存方式…"></textarea>
        <p class="mc-hint">{{ (form.description || '').length }}/2000</p>
        <p class="mc-form-error" v-if="errors.description">{{ errors.description }}</p>
      </div>

      <div class="fm-sheet-foot mc-sheet-foot">
        <button class="fm-btn" :disabled="saving || uploading" @click="closeForm">取消</button>
        <button class="fm-btn fm-btn-primary" :disabled="saving || uploading" @click="save">
          {{ saving ? '保存中…' : (mode === 'create' ? '保存' : '保存修改') }}
        </button>
      </div>
    </div>
  </div>`,
};

/* ============================================================ 会员管理 */
const McMembers = {
  data() {
    return {
      members: [], keyword: '', loading: true,
      target: null, form: { type: 'in', amount: '', reason: '' }, saving: false,
      detail: null, detailData: null,
    };
  },
  created() { this.load(); },
  methods: {
    fmtMoney: FM.fmtMoney,
    yuanToCents: FM.yuanToCents,
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams();
        if (this.keyword) q.set('keyword', this.keyword);
        this.members = (await api.get('/merchant/members?' + q.toString())).members;
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },
    openBalance(member) {
      this.target = member;
      this.form = { type: 'in', amount: '', reason: '' };
    },
    async submitBalance() {
      const amount = Number(this.form.amount);
      if (!amount || amount <= 0) { FM.toast('请输入大于 0 的金额', 'danger'); return; }
      const changeCents = this.form.type === 'in' ? this.yuanToCents(amount) : -this.yuanToCents(amount);
      this.saving = true;
      try {
        await api.post('/merchant/members/' + this.target.id + '/balance', {
          changeCents: changeCents,
          reason: this.form.reason || (this.form.type === 'in' ? '门店充值' : '门店扣减'),
        });
        FM.toast(this.form.type === 'in' ? '充值成功' : '扣减成功');
        this.target = null;
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.saving = false; }
    },
    async openDetail(member) {
      try {
        this.detailData = await api.get('/merchant/members/' + member.id);
        this.detail = member;
      } catch (e) { FM.toast(e.message, 'danger'); }
    },
  },
  template: `
  <div>
    <header class="fm-navbar"><div class="fm-navbar-title">会员余额</div></header>
    <form class="fm-section mc-search" @submit.prevent="load">
      <input class="fm-input" v-model.trim="keyword" placeholder="手机号 / 昵称">
      <button class="fm-btn" type="submit">搜索</button>
    </form>

    <div class="fm-section">
      <div v-if="loading" class="fm-section">
        <div class="fm-skeleton" v-for="n in 4" :key="n"></div>
      </div>
      <div v-else-if="!members.length" class="fm-empty">
        <div class="fm-empty-ring"></div>
        <p>还没有会员</p>
        <p>顾客在会员端用手机号注册后，就会出现在这里</p>
      </div>
      <div class="fm-card mc-member" v-for="member in members" :key="member.id">
        <div class="mc-member-head">
          <div class="mc-avatar" aria-hidden="true">{{ String(member.nickname || '会').slice(0, 1) }}</div>
          <div class="mc-member-id">
            <b>{{ member.nickname }}</b>
            <p class="mc-member-phone">{{ member.phone }}</p>
          </div>
          <div class="mc-member-money">
            <b class="mc-member-balance">{{ fmtMoney(member.balanceCents) }}</b>
            <span class="mc-member-points">{{ member.points }} 积分</span>
          </div>
        </div>
        <div class="mc-member-stats">
          <span>预约 <b>{{ member.orderCount }}</b> 笔</span>
          <span>累计消费 <b>{{ fmtMoney(member.totalSpentCents) }}</b></span>
        </div>
        <div class="mc-member-actions">
          <button class="fm-btn fm-btn-sm fm-btn-primary" @click="openBalance(member)">调整余额</button>
          <button class="fm-btn fm-btn-sm mc-act" @click="openDetail(member)">明细</button>
        </div>
      </div>
    </div>

    <div class="fm-mask" v-if="target" @click="target = null"></div>
    <div class="fm-sheet" v-if="target">
      <h3 class="fm-sheet-title">调整余额 · {{ target.nickname }}</h3>
      <p class="fm-muted">当前余额 {{ fmtMoney(target.balanceCents) }}</p>
      <div class="fm-field">
        <label class="fm-label">操作类型</label>
        <select class="fm-select" v-model="form.type">
          <option value="in">充值 / 增加</option>
          <option value="out">扣减</option>
        </select>
      </div>
      <div class="fm-field"><label class="fm-label">金额（元）</label><input class="fm-input" type="number" step="0.01" v-model="form.amount"></div>
      <div class="fm-field"><label class="fm-label">事由</label><input class="fm-input" v-model.trim="form.reason" placeholder="例：门店充值 100 元"></div>
      <div class="fm-sheet-foot">
        <button class="fm-btn" @click="target = null">取消</button>
        <button class="fm-btn fm-btn-primary" :disabled="saving" @click="submitBalance">{{ saving ? '提交中…' : '确认调整' }}</button>
      </div>
    </div>

    <div class="fm-mask" v-if="detail && detailData" @click="detail = null; detailData = null"></div>
    <div class="fm-sheet" v-if="detail && detailData">
      <h3 class="fm-sheet-title">账户明细 · {{ detail.nickname }}</h3>
      <div class="fm-wallet" style="margin-bottom:12px">
        <div class="fm-wallet-item"><span>余额</span><b class="mc-amount">{{ fmtMoney(detailData.member.balanceCents) }}</b></div>
        <div class="fm-wallet-item"><span>积分</span><b class="mc-amount">{{ detailData.member.points }}</b></div>
      </div>
      <h4 class="fm-card-title">余额流水</h4>
      <div class="fm-list">
        <div class="fm-row" v-for="log in detailData.balanceLogs" :key="log.id">
          <div class="fm-row-main">
            <p class="fm-row-title">{{ log.reason }}</p>
            <p class="fm-row-desc">{{ log.createdAt }} · {{ log.operator }}</p>
          </div>
          <div class="fm-row-side">
            <b :class="log.changeCents > 0 ? 'mc-up' : 'mc-down'">
              {{ log.changeCents > 0 ? '+' : '' }}{{ fmtMoney(log.changeCents) }}
            </b>
          </div>
        </div>
        <div class="fm-row" v-if="!detailData.balanceLogs.length"><div class="fm-row-main"><p class="fm-row-desc">暂无流水</p></div></div>
      </div>
      <h4 class="fm-card-title">积分流水</h4>
      <div class="fm-list">
        <div class="fm-row" v-for="log in detailData.pointsLogs" :key="log.id">
          <div class="fm-row-main">
            <p class="fm-row-title">{{ log.reason }}</p>
            <p class="fm-row-desc">{{ log.createdAt }} · {{ log.operator }}</p>
          </div>
          <div class="fm-row-side">
            <b :class="log.change > 0 ? 'mc-up' : 'mc-down'">
              {{ log.change > 0 ? '+' : '' }}{{ log.change }}
            </b>
          </div>
        </div>
        <div class="fm-row" v-if="!detailData.pointsLogs.length"><div class="fm-row-main"><p class="fm-row-desc">暂无积分流水</p></div></div>
      </div>
      <div class="fm-sheet-foot"><button class="fm-btn fm-btn-block" @click="detail = null; detailData = null">关闭</button></div>
    </div>
  </div>`,
};

/* ============================================================ 更多（公告 / 奖品 / 兑换） */
const McMore = {
  data() { return { tab: 'notice', notices: [], prizes: [], redemptions: [], loading: true, noticeForm: null, noticeMode: 'create', noticeSaving: false, prizeForm: null, prizeMode: 'create', prizeSaving: false }; },
  created() { this.load(); },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [notices, prizes, redemptions] = await Promise.all([
          api.get('/announcements'),
          api.get('/prizes?scope=all'),
          api.get('/redemptions'),
        ]);
        this.notices = notices.announcements;
        this.prizes = prizes.prizes;
        this.redemptions = redemptions.redemptions;
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },
    async issue(item) {
      if (!window.confirm('确认已向 ' + item.memberName + ' 发放「' + item.prizeName + '」？')) return;
      try {
        await api.post('/redemptions/' + item.id + '/status', { status: 'done' });
        FM.toast('已发放');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },

    /** 兑换「取消」：后端会在事务里退还积分并归还奖品库存 */
    async cancelRedemption(item) {
      if (!window.confirm('取消「' + item.prizeName + '」的兑换？\n'
        + item.costPoints + ' 积分会退还给 ' + item.memberName + '，奖品库存 +1。')) return;
      try {
        await api.post('/redemptions/' + item.id + '/status', { status: 'cancelled' });
        FM.toast('已取消并退还积分');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },

    /* ---------------------------------------------- 公告增删改 */
    openNoticeCreate() {
      this.noticeMode = 'create';
      this.noticeForm = { id: null, title: '', content: '' };
    },
    openNoticeEdit(item) {
      this.noticeMode = 'edit';
      this.noticeForm = { id: item.id, title: item.title, content: item.content || '' };
    },
    closeNoticeForm() { if (this.noticeSaving) return; this.noticeForm = null; },
    async saveNotice() {
      const f = this.noticeForm;
      const title = String(f.title || '').trim();
      const content = String(f.content || '').trim();
      if (!title) { FM.toast('请填写公告标题', 'danger'); return; }
      if (title.length > 128) { FM.toast('标题不能超过 128 个字', 'danger'); return; }
      if (content.length > 2000) { FM.toast('内容不能超过 2000 个字', 'danger'); return; }
      this.noticeSaving = true;
      try {
        if (this.noticeMode === 'create') {
          await api.post('/merchant/announcements', { title: title, content: content });
        } else {
          await api.put('/merchant/announcements/' + f.id, { title: title, content: content });
        }
        FM.toast(this.noticeMode === 'create' ? '公告已发布' : '公告已更新');
        this.noticeForm = null;
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.noticeSaving = false; }
    },
    async removeNotice(item) {
      if (!window.confirm('删除公告「' + item.title + '」？')) return;
      try {
        await api.del('/merchant/announcements/' + item.id + '/delete');
        FM.toast('公告已删除');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },

    /* ---------------------------------------------- 奖品增删改 */
    openPrizeCreate() {
      this.prizeMode = 'create';
      this.prizeForm = { id: null, name: '', costPoints: '', stock: 0, description: '', imageUrl: '', status: 'on' };
    },
    openPrizeEdit(p) {
      this.prizeMode = 'edit';
      this.prizeForm = {
        id: p.id, name: p.name, costPoints: p.costPoints, stock: p.stock,
        description: p.description || '', imageUrl: p.imageUrl || '', status: p.status,
      };
    },
    closePrizeForm() { if (this.prizeSaving) return; this.prizeForm = null; },
    async savePrize() {
      const f = this.prizeForm;
      const name = String(f.name || '').trim();
      const cost = Number(f.costPoints);
      const stockRaw = String(f.stock === null || f.stock === undefined ? '' : f.stock).trim();
      const stock = stockRaw === '' ? 0 : Number(stockRaw);
      if (!name) { FM.toast('请填写奖品名称', 'danger'); return; }
      if (name.length > 64) { FM.toast('名称不能超过 64 个字', 'danger'); return; }
      if (!Number.isInteger(cost) || cost < 1) { FM.toast('所需积分必须是 1 以上的整数', 'danger'); return; }
      if (!Number.isInteger(stock) || stock < 0) { FM.toast('库存必须是 0 或正整数', 'danger'); return; }
      if (String(f.description || '').length > 255) { FM.toast('说明不能超过 255 个字', 'danger'); return; }
      if (String(f.imageUrl || '').length > 512) { FM.toast('图片地址不能超过 512 个字符', 'danger'); return; }
      const payload = {
        name: name, costPoints: cost, stock: stock,
        description: String(f.description || '').trim(),
        imageUrl: String(f.imageUrl || '').trim(),
        status: f.status === 'off' ? 'off' : 'on',
      };
      this.prizeSaving = true;
      try {
        if (this.prizeMode === 'create') await api.post('/merchant/prizes', payload);
        else await api.put('/merchant/prizes/' + f.id, payload);
        FM.toast(this.prizeMode === 'create' ? '奖品已创建' : '奖品已更新');
        this.prizeForm = null;
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.prizeSaving = false; }
    },
    async togglePrize(p) {
      const next = p.status === 'on' ? 'off' : 'on';
      try {
        await api.put('/merchant/prizes/' + p.id, { status: next });
        FM.toast(next === 'on' ? '已上架' : '已下架');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },
    async removePrize(p) {
      if (!window.confirm('删除奖品「' + p.name + '」？\n已有的兑换记录不会消失。')) return;
      try {
        await api.del('/merchant/prizes/' + p.id + '/delete');
        FM.toast('奖品已删除');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },

    async logout() {
      await api.logout();
      FM.toast('已退出登录');
      router.navigate('/auth');
    },
  },
  template: `
  <div>
    <header class="fm-navbar"><div class="fm-navbar-title">更多</div></header>
    <div class="fm-section mc-segwrap">
      <div class="fm-seg" role="tablist" aria-label="内容分类">
        <button :class="['fm-seg-btn', tab === 'notice' ? 'is-on' : '']" role="tab"
                :aria-selected="tab === 'notice'" @click="tab = 'notice'">公告 {{ notices.length }}</button>
        <button :class="['fm-seg-btn', tab === 'prize' ? 'is-on' : '']" role="tab"
                :aria-selected="tab === 'prize'" @click="tab = 'prize'">奖品 {{ prizes.length }}</button>
        <button :class="['fm-seg-btn', tab === 'exchange' ? 'is-on' : '']" role="tab"
                :aria-selected="tab === 'exchange'" @click="tab = 'exchange'">兑换 {{ redemptions.length }}</button>
      </div>
    </div>
    <div class="fm-section">
      <div v-if="loading" class="fm-section">
        <div class="fm-skeleton" v-for="n in 4" :key="n"></div>
      </div>
      <template v-else>
        <template v-if="tab === 'notice'">
          <div class="mc-toolbar">
            <button class="fm-btn fm-btn-sm fm-btn-primary" @click="openNoticeCreate">+ 发布公告</button>
          </div>
          <div class="fm-card mc-notice" v-for="item in notices" :key="item.id">
            <b class="mc-notice-title">{{ item.title }}</b>
            <p class="mc-notice-body">{{ item.content }}</p>
            <p class="mc-notice-date">{{ item.createdAt }}</p>
            <div class="mc-card-actions">
              <button class="fm-btn fm-btn-sm" @click="openNoticeEdit(item)">编辑</button>
              <button class="fm-btn fm-btn-sm mc-act is-danger" @click="removeNotice(item)">删除</button>
            </div>
          </div>
          <div class="fm-empty" v-if="!notices.length"><p>还没有发布公告</p><p>点上面的「发布公告」，顾客会在会员端首页看到</p></div>
        </template>

        <template v-else-if="tab === 'prize'">
          <div class="mc-toolbar">
            <button class="fm-btn fm-btn-sm fm-btn-primary" @click="openPrizeCreate">+ 新增奖品</button>
          </div>
          <div class="fm-list">
            <div class="fm-row mc-row--actions" v-for="prize in prizes" :key="prize.id">
              <img v-if="prize.imageUrl" class="fm-thumb" :src="prize.imageUrl" :alt="prize.name"
                   loading="lazy" @error="prize.imageUrl = ''">
              <div v-else class="fm-thumb mc-thumb--empty">礼</div>
              <div class="fm-row-main">
                <p class="fm-row-title">{{ prize.name }}</p>
                <p class="fm-row-desc">{{ prize.costPoints }} 积分 · 剩余 {{ prize.stock }}</p>
              </div>
              <span class="fm-badge" :class="prize.status === 'on' ? 'is-ok' : 'is-muted'">
                {{ prize.status === 'on' ? '可兑换' : '已下架' }}
              </span>
              <div class="mc-row-actions">
                <button class="fm-btn fm-btn-sm" @click="openPrizeEdit(prize)">编辑</button>
                <button class="fm-btn fm-btn-sm mc-act" @click="togglePrize(prize)">{{ prize.status === 'on' ? '下架' : '上架' }}</button>
                <button class="fm-btn fm-btn-sm mc-act is-danger" @click="removePrize(prize)">删除</button>
              </div>
            </div>
          </div>
          <div class="fm-empty" v-if="!prizes.length"><p>还没有奖品</p><p>点上面的「新增奖品」，顾客就能用积分兑换了</p></div>
        </template>

        <template v-else>
          <div class="fm-card" v-for="item in redemptions" :key="item.id">
            <div class="mc-exchange-head">
              <b>{{ item.prizeName }}</b>
              <span class="fm-badge" :class="item.status === 'done' ? 'is-ok' : (item.status === 'cancelled' ? 'is-muted' : 'is-warn')">
                {{ item.statusText }}
              </span>
            </div>
            <p class="fm-muted">{{ item.memberName }} · {{ item.memberPhone }} · {{ item.costPoints }} 积分</p>
            <p class="fm-muted">{{ item.createdAt }}</p>
            <div class="mc-card-actions" v-if="item.status === 'pending'">
              <button class="fm-btn fm-btn-sm fm-btn-primary" @click="issue(item)">确认发放</button>
              <button class="fm-btn fm-btn-sm mc-act is-danger" @click="cancelRedemption(item)">取消并退积分</button>
            </div>
          </div>
          <div class="fm-empty" v-if="!redemptions.length"><p>还没有兑换记录</p><p>顾客用积分兑换商品后，会记录在这里</p></div>
        </template>
      </template>
    </div>
    <div class="fm-section">
      <button class="fm-btn fm-btn-danger fm-btn-block" @click="logout">退出登录</button>
    </div>

    <!-- 公告编辑弹层 -->
    <div class="fm-mask" v-if="noticeForm" @click="closeNoticeForm"></div>
    <div class="fm-sheet" v-if="noticeForm">
      <h3 class="fm-sheet-title">{{ noticeMode === 'create' ? '发布公告' : '编辑公告' }}</h3>
      <div class="fm-field">
        <label class="fm-label">标题 <em class="mc-req">*</em></label>
        <input class="fm-input" v-model.trim="noticeForm.title" maxlength="128"
               placeholder="例：本周新到阳山水蜜桃">
        <p class="mc-hint">{{ (noticeForm.title || '').length }}/128</p>
      </div>
      <div class="fm-field">
        <label class="fm-label">内容</label>
        <textarea class="fm-textarea" v-model.trim="noticeForm.content" maxlength="2000"
                  placeholder="活动时间、优惠内容、到货情况…"></textarea>
        <p class="mc-hint">{{ (noticeForm.content || '').length }}/2000</p>
      </div>
      <div class="fm-sheet-foot mc-sheet-foot">
        <button class="fm-btn" :disabled="noticeSaving" @click="closeNoticeForm">取消</button>
        <button class="fm-btn fm-btn-primary" :disabled="noticeSaving" @click="saveNotice">
          {{ noticeSaving ? '保存中…' : (noticeMode === 'create' ? '发布' : '保存修改') }}
        </button>
      </div>
    </div>

    <!-- 奖品编辑弹层 -->
    <div class="fm-mask" v-if="prizeForm" @click="closePrizeForm"></div>
    <div class="fm-sheet" v-if="prizeForm">
      <h3 class="fm-sheet-title">{{ prizeMode === 'create' ? '新增奖品' : '编辑奖品' }}</h3>
      <div class="fm-field">
        <label class="fm-label">奖品名称 <em class="mc-req">*</em></label>
        <input class="fm-input" v-model.trim="prizeForm.name" maxlength="64"
               placeholder="例：一箱红富士苹果">
      </div>
      <div class="mc-form-row">
        <div class="fm-field">
          <label class="fm-label">所需积分 <em class="mc-req">*</em></label>
          <input class="fm-input" type="number" min="1" step="1" v-model="prizeForm.costPoints" placeholder="500">
        </div>
        <div class="fm-field">
          <label class="fm-label">库存</label>
          <input class="fm-input" type="number" min="0" step="1" v-model="prizeForm.stock">
        </div>
      </div>
      <div class="fm-field">
        <label class="fm-label">图片地址</label>
        <input class="fm-input" v-model.trim="prizeForm.imageUrl" maxlength="512" placeholder="选填，粘贴图片链接">
      </div>
      <div class="fm-field">
        <label class="fm-label">兑换状态</label>
        <select class="fm-select" v-model="prizeForm.status">
          <option value="on">可兑换（会员端可见）</option>
          <option value="off">暂不开放</option>
        </select>
      </div>
      <div class="fm-field">
        <label class="fm-label">说明</label>
        <textarea class="fm-textarea" v-model.trim="prizeForm.description" maxlength="255" placeholder="选填"></textarea>
      </div>
      <div class="fm-sheet-foot mc-sheet-foot">
        <button class="fm-btn" :disabled="prizeSaving" @click="closePrizeForm">取消</button>
        <button class="fm-btn fm-btn-primary" :disabled="prizeSaving" @click="savePrize">
          {{ prizeSaving ? '保存中…' : (prizeMode === 'create' ? '创建' : '保存修改') }}
        </button>
      </div>
    </div>
  </div>`,
};

/* ============================================================ 登录 */
const McAuth = {
  data() { return { form: { phone: '', password: '' }, submitting: false }; },
  methods: {
    fill() { this.form.phone = '13800000000'; this.form.password = 'admin123'; },
    async submit() {
      this.submitting = true;
      try {
        const user = await api.login(this.form.phone, this.form.password);
        if (!user.isMerchant) {
          await api.logout();
          FM.toast('该账号不是商户，请使用商户账号登录', 'danger');
          return;
        }
        FM.toast('欢迎回来，' + user.nickname);
        router.navigate('/');
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.submitting = false; }
    },
  },
  template: `
  <div class="fm-auth">
    <div class="mc-auth-logo" aria-hidden="true"><span class="mc-auth-logo-mark">果</span></div>
    <h1 class="mc-auth-title">果子来了</h1>
    <p class="mc-auth-sub">商户工作台 · 管理商品上下架、会员余额、预约订单与门店公告</p>
    <div class="fm-field">
      <label class="fm-label">商户手机号</label>
      <input class="fm-input" type="tel" maxlength="11" v-model.trim="form.phone" placeholder="请输入商户账号">
    </div>
    <div class="fm-field">
      <label class="fm-label">密码</label>
      <input class="fm-input" type="password" v-model="form.password" placeholder="请输入密码">
    </div>
    <button class="fm-btn fm-btn-primary fm-btn-block fm-btn-lg" :disabled="submitting" @click="submit">
      {{ submitting ? '登录中…' : '登录' }}
    </button>
    <div class="fm-demo">
      <span>演示商户账号</span>
      <button class="fm-btn fm-btn-sm" @click="fill">13800000000 / admin123</button>
    </div>
  </div>`,
};

/* ============================================================ 根组件 */
const App = {
  data() { return { Auth, R, resolved: { route: ROUTES[0], params: {} }, tabs: TABS, pendingCount: 0 }; },
  computed: {
    view() {
      if (!Auth.user || !Auth.user.isMerchant) return 'mc-auth';
      return this.resolved.route.view;
    },
    showTab() { return !!Auth.user && Auth.user.isMerchant && R.path !== '/auth'; },
    activeTab() { return R.path; },
  },
  created() {
    router.onStart((r) => { this.resolved = resolve(r.path); this.loadBadge(); });
    this.loadBadge();
  },
  methods: {
    go(path) { router.navigate(path); },
    // 「订单」标签上的待确认角标（复用共享层的 .fm-tab-badge）。
    // 它只是提示，失败就静默忽略，不弹错误打扰店主。
    async loadBadge() {
      if (!Auth.user || !Auth.user.isMerchant) return;
      try {
        const res = await api.get('/merchant/stats');
        this.pendingCount = (res.stats && res.stats.pendingCount) || 0;
      } catch (e) { /* 静默 */ }
    },
  },
  template: `
  <div class="fm-app">
    <div class="fm-body">
      <component :is="view" :key="R.path"></component>
    </div>
    <nav class="fm-tabbar" v-if="showTab">
      <button v-for="tab in tabs" :key="tab.path"
              :class="['fm-tab', activeTab === tab.path ? 'active' : '']" @click="go(tab.path)">
        <span class="fm-tab-dot">{{ tab.icon }}</span>{{ tab.label }}
        <span class="fm-tab-badge" v-if="tab.path === '/orders' && pendingCount > 0">{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
      </button>
    </nav>
  </div>`,
};

(async function main() {
  await api.loadMe();
  const app = Vue.createApp(App);
  app.component('mc-overview', McOverview);
  app.component('mc-orders', McOrders);
  app.component('mc-products', McProducts);
  app.component('mc-members', McMembers);
  app.component('mc-more', McMore);
  app.component('mc-auth', McAuth);
  app.mount('#app');
})();

/* ============================================================================
 * TODO（商户端前端组员，按优先级）
 * ----------------------------------------------------------------------------
 * 本轮已完成（组员 A）
 *   ✅ 新增商品：McProducts 已抽成「新增 / 编辑」共用表单，POST /merchant/products
 *   ✅ 编辑商品补齐 originPriceCents（划线价）与 imageUrl（主图）——原来界面里没有这两个字段
 *   ✅ 主图拍照 / 相册选择 + 本地即时预览 + 图片直链兜底
 *   ✅ 商品分类筛选（复用 GET /products 已返回的 categories）
 *   ✅ 概览页补齐 completedCount / confirmedCount / pointsIssued / redemptionCount
 *   ✅ 会员明细补齐积分流水（pointsLogs）
 *   ✅ 视觉换肤：主色由果橙改为叶绿（与客户端区分），电脑端呈现为「手机」模型
 *   ✅ 标签栏加图标 + 「订单」待确认角标；加载态改骨架屏；指标卡分主次；商品空图兜底
 *
 * 本轮已完成（组员 A，第二批：照「分工与协作.md」的待办清单逐条落地）
 *   ✅ P0 删除商品：商品卡加「删除」，DELETE /merchant/products/<id>/delete
 *      已有销售记录的商品会额外提醒「建议改为下架」，避免误删丢数据
 *   ✅ P1 公告增删改：McMore 公告页加「+ 发布公告」，每张卡片加「编辑 / 删除」
 *      POST /merchant/announcements、PUT·DELETE /merchant/announcements/<id>
 *   ✅ P1 奖品增删改：McMore 奖品页加「+ 新增奖品」，每行加「上架·下架 / 编辑 / 删除」
 *      POST /merchant/prizes、PUT /merchant/prizes/<id>、DELETE …/<id>/delete
 *   ✅ P1 兑换取消退积分：兑换页加「取消并退积分」
 *      POST /redemptions/<id>/status { status:'cancelled' }（退还与库存回滚由后端事务完成）
 *   ✅ P1 订单批量处理：订单页「批量」进入多选态，全选 + 批量确认 / 批量完成
 *      后端只有单条接口，前端逐条循环，单条失败不影响其它单，结束后汇总提示
 *
 * 本轮已完成（第三批：后端 2026-11-04 补齐三个接口后接线）
 *   ✅ P0 商品主图真正上传：POST /merchant/upload（multipart，字段名 file，返回 { url }）
 *      共享层的 api.post 强制 JSON、传不了文件，所以这里用原生 fetch + FormData 单独发；
 *      成功后把返回的 url 写回 imageUrl，仍保留「粘贴直链」兜底
 *   ✅ P2 营收趋势图：GET /merchant/stats?days=7|30 的返回里多了 revenueTrend，
 *      纯 CSS 柱状图渲染，不引图表库（项目没有构建步骤）
 *   ✅ P2 订单按日期筛选：GET /orders 增加 dateFrom/dateTo（YYYY-MM-DD，含首尾两天）
 *
 * 仍然做不了的（后端交接文档 P1 所列，不是前端能单方面解决的）
 *   列表分页（接口全量返回，/orders 与 /redemptions 硬上限 300 条）
 *   登录态自动续期（令牌无过期时间，需要后端先支持）
 *
 * 只允许改：mobile/merchant/**。共享层 mobile/shared/** 只读，
 * 需要新增通用能力请先在群里同步，不要复制一份改过的共享层副本。
 * ==========================================================================*/
