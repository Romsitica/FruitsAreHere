/* ============================================================================
 * 商户端 APP · 入口脚本
 * ----------------------------------------------------------------------------
 * 责任组员：商户端前端（移动端商户 APP）
 * 归属目录：mobile/merchant/**            ← 只改这个目录里的文件
 * 只读依赖：mobile/shared/api.js、mobile/shared/theme.css（共享层，不要改）
 *
 * 已完成（可直接跑通）：商户登录、经营概览、预约订单流转（确认/完成/取消）、
 *                     商品上下架与编辑、会员余额增减、公告与奖品只读列表
 * 待组员完善：见文件末尾 TODO 清单
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
  { path: '/', label: '概览' },
  { path: '/orders', label: '订单' },
  { path: '/products', label: '商品' },
  { path: '/members', label: '会员' },
  { path: '/more', label: '更多' },
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

/* ============================================================ 经营概览 */
const McOverview = {
  data() { return { Auth, stats: null, pending: [], loading: true }; },
  created() { this.load(); },
  methods: {
    fmtMoney: FM.fmtMoney,
    go(path) { router.navigate(path); },
    async load() {
      this.loading = true;
      try {
        const [stats, orders] = await Promise.all([
          api.get('/merchant/stats'),
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
    <div v-if="loading" class="fm-loading">正在加载经营数据…</div>
    <template v-else-if="stats">
      <div class="fm-section">
        <div class="fm-stat-grid">
          <div class="fm-stat"><span>累计营收</span><b>{{ fmtMoney(stats.salesCents) }}</b><em>已完成订单</em></div>
          <div class="fm-stat"><span>待确认预约</span><b>{{ stats.pendingCount }}</b><em>共 {{ stats.orderCount }} 笔订单</em></div>
          <div class="fm-stat"><span>会员数量</span><b>{{ stats.memberCount }}</b><em>余额合计 {{ fmtMoney(stats.balanceCents) }}</em></div>
          <div class="fm-stat"><span>在售商品</span><b>{{ stats.productOnCount }}</b><em>已下架 {{ stats.productOffCount }} 款</em></div>
        </div>
      </div>

      <div class="fm-block-title">待确认预约
        <button class="fm-btn fm-btn-sm fm-btn-ghost" @click="go('/orders')">全部</button>
      </div>
      <div class="fm-section">
        <div v-if="!pending.length" class="fm-empty"><p>暂无待确认预约</p></div>
        <div class="fm-list" v-else>
          <div class="fm-row" v-for="order in pending" :key="order.id">
            <div class="fm-row-main">
              <p class="fm-row-title">{{ order.productName }} × {{ order.quantity }}</p>
              <p class="fm-row-desc">{{ order.memberName }} · {{ order.memberPhone }} · {{ order.pickupTime || '时间不限' }}</p>
            </div>
            <div class="fm-row-side"><b class="fm-price-sm">{{ fmtMoney(order.totalCents) }}</b></div>
          </div>
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
  data() { return { orders: [], status: 'pending', keyword: '', loading: true, detail: null, tabs: ORDER_TABS }; },
  created() { this.load(); },
  methods: {
    fmtMoney: FM.fmtMoney,
    statusClass(s) { return STATUS_CLASS[s] || 'is-muted'; },
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams({ status: this.status });
        if (this.keyword) q.set('keyword', this.keyword);
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
  },
  template: `
  <div>
    <header class="fm-navbar"><div class="fm-navbar-title">预约订单</div></header>
    <div class="fm-chips">
      <button v-for="item in tabs" :key="item[0]" :class="['fm-chip', status === item[0] ? 'active' : '']"
              @click="status = item[0]; load()">{{ item[1] }}</button>
    </div>
    <form class="fm-section mc-search" @submit.prevent="load">
      <input class="fm-input" v-model.trim="keyword" placeholder="订单号 / 商品 / 手机号">
      <button class="fm-btn" type="submit">搜索</button>
    </form>

    <div class="fm-section">
      <div v-if="loading" class="fm-loading">正在加载…</div>
      <div v-else-if="!orders.length" class="fm-empty"><div class="fm-empty-ring"></div><p>暂无订单</p></div>
      <div class="fm-card" v-for="order in orders" :key="order.id" @click="detail = order">
        <div class="mc-order-head">
          <b>{{ order.orderNo }}</b>
          <span class="fm-badge" :class="statusClass(order.status)">{{ order.statusText }}</span>
        </div>
        <p class="fm-strong" style="margin:8px 0 2px">{{ order.productName }} × {{ order.quantity }}</p>
        <p class="fm-muted">{{ order.memberName }} · {{ order.memberPhone }}</p>
        <p class="fm-muted">{{ order.pickupTime || '时间不限' }} · {{ order.payMethod === 'balance' ? '余额支付' : '到店支付' }}</p>
        <div class="mc-order-foot">
          <span class="fm-price-sm">{{ fmtMoney(order.totalCents) }}</span>
          <span class="mc-order-actions">
            <button v-if="order.status === 'pending'" class="fm-btn fm-btn-sm fm-btn-primary"
                    @click.stop="change(order, 'confirmed', '确认')">确认</button>
            <button v-if="order.status === 'pending' || order.status === 'confirmed'" class="fm-btn fm-btn-sm fm-btn-leaf"
                    @click.stop="change(order, 'completed', '完成')">完成</button>
            <button v-if="order.status === 'pending' || order.status === 'confirmed'" class="fm-btn fm-btn-sm fm-btn-danger"
                    @click.stop="change(order, 'cancelled', '取消')">取消</button>
          </span>
        </div>
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
      products: [], categories: [], keyword: '', loading: true,
      editing: null, saving: false,
    };
  },
  created() { this.load(); },
  methods: {
    fmtMoney: FM.fmtMoney,
    centsToYuan: FM.centsToYuan,
    yuanToCents: FM.yuanToCents,
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams({ scope: 'all' });
        if (this.keyword) q.set('keyword', this.keyword);
        const data = await api.get('/products?' + q.toString());
        this.products = data.products;
        this.categories = data.categories || [];
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.loading = false; }
    },
    openEdit(product) {
      this.editing = {
        id: product.id, name: product.name, category: product.category,
        priceYuan: this.centsToYuan(product.priceCents), unit: product.unit,
        stock: product.stock, status: product.status, description: product.description,
        imageUrl: product.imageUrl,
      };
    },
    notImplemented() {
      FM.toast('新增商品待完善：见 app.js 末尾 TODO P0-1', 'danger');
    },
    async toggle(product) {
      const next = product.status === 'on' ? 'off' : 'on';
      try {
        await api.post('/products/' + product.id + '/status', { status: next });
        FM.toast(next === 'on' ? '已上架' : '已下架');
        this.load();
      } catch (e) { FM.toast(e.message, 'danger'); }
    },
    async save() {
      const form = this.editing;
      this.saving = true;
      try {
        await api.put('/merchant/products/' + form.id, {
          name: form.name,
          category: form.category,
          priceCents: this.yuanToCents(form.priceYuan),
          unit: form.unit,
          stock: Number(form.stock) || 0,
          status: form.status,
          description: form.description,
        });
        FM.toast('商品已更新');
        this.editing = null;
        this.load();
      } catch (e) {
        FM.toast(e.message, 'danger');
      } finally { this.saving = false; }
    },
  },
  template: `
  <div>
    <header class="fm-navbar">
      <div class="fm-navbar-title">商品管理</div>
      <div class="fm-navbar-actions">
        <button class="fm-btn fm-btn-sm fm-btn-primary" @click="notImplemented">+ 新增</button>
      </div>
    </header>
    <form class="fm-section mc-search" @submit.prevent="load">
      <input class="fm-input" v-model.trim="keyword" placeholder="搜索商品">
      <button class="fm-btn" type="submit">搜索</button>
    </form>

    <div class="fm-section">
      <div v-if="loading" class="fm-loading">正在加载商品…</div>
      <div v-else class="fm-card mc-goods" v-for="item in products" :key="item.id">
        <img class="mc-goods-img" :src="item.imageUrl" :alt="item.name" loading="lazy">
        <div class="mc-goods-main">
          <div class="mc-goods-head">
            <b>{{ item.name }}</b>
            <span class="fm-badge" :class="item.status === 'on' ? 'is-ok' : 'is-muted'">
              {{ item.status === 'on' ? '已上架' : '已下架' }}
            </span>
          </div>
          <p class="fm-muted">{{ item.category }} · {{ item.unit }}</p>
          <div class="mc-goods-foot">
            <span class="fm-price-sm">{{ fmtMoney(item.priceCents) }}</span>
            <span class="fm-muted">库存 {{ item.stock }} · 已售 {{ item.sales }}</span>
          </div>
          <div class="mc-goods-actions">
            <button class="fm-btn fm-btn-sm" @click="toggle(item)">{{ item.status === 'on' ? '下架' : '上架' }}</button>
            <button class="fm-btn fm-btn-sm" @click="openEdit(item)">编辑</button>
          </div>
        </div>
      </div>
    </div>

    <div class="fm-mask" v-if="editing" @click="editing = null"></div>
    <div class="fm-sheet" v-if="editing">
      <h3 class="fm-sheet-title">编辑商品</h3>
      <div class="fm-field"><label class="fm-label">名称</label><input class="fm-input" v-model.trim="editing.name"></div>
      <div class="fm-field"><label class="fm-label">分类</label><input class="fm-input" v-model.trim="editing.category"></div>
      <div class="fm-field"><label class="fm-label">售价（元）</label><input class="fm-input" type="number" step="0.01" v-model="editing.priceYuan"></div>
      <div class="fm-field"><label class="fm-label">库存</label><input class="fm-input" type="number" v-model="editing.stock"></div>
      <div class="fm-field"><label class="fm-label">规格单位</label><input class="fm-input" v-model.trim="editing.unit"></div>
      <div class="fm-field">
        <label class="fm-label">状态</label>
        <select class="fm-select" v-model="editing.status">
          <option value="on">上架</option><option value="off">下架</option>
        </select>
      </div>
      <div class="fm-field"><label class="fm-label">商品详情</label><textarea class="fm-textarea" v-model.trim="editing.description"></textarea></div>
      <div class="fm-sheet-foot">
        <button class="fm-btn" @click="editing = null">取消</button>
        <button class="fm-btn fm-btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
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
      <div v-if="loading" class="fm-loading">正在加载会员…</div>
      <div v-else-if="!members.length" class="fm-empty"><p>暂无会员</p></div>
      <div class="fm-card mc-member" v-for="member in members" :key="member.id">
        <div class="mc-member-head">
          <div>
            <b>{{ member.nickname }}</b>
            <p class="fm-muted">{{ member.phone }}</p>
          </div>
          <div class="mc-member-money">
            <b class="fm-price-sm">{{ fmtMoney(member.balanceCents) }}</b>
            <span class="fm-muted">{{ member.points }} 积分</span>
          </div>
        </div>
        <p class="fm-muted">预约 {{ member.orderCount }} 笔 · 累计消费 {{ fmtMoney(member.totalSpentCents) }}</p>
        <div class="mc-member-actions">
          <button class="fm-btn fm-btn-sm fm-btn-primary" @click="openBalance(member)">调整余额</button>
          <button class="fm-btn fm-btn-sm" @click="openDetail(member)">明细</button>
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
      <div class="fm-sheet-foot"><button class="fm-btn fm-btn-block" @click="detail = null; detailData = null">关闭</button></div>
    </div>
  </div>`,
};

/* ============================================================ 更多（公告 / 奖品 / 兑换） */
const McMore = {
  data() { return { tab: 'notice', notices: [], prizes: [], redemptions: [], loading: true }; },
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
    async logout() {
      await api.logout();
      FM.toast('已退出登录');
      router.navigate('/auth');
    },
  },
  template: `
  <div>
    <header class="fm-navbar"><div class="fm-navbar-title">更多</div></header>
    <div class="fm-chips">
      <button :class="['fm-chip', tab === 'notice' ? 'active' : '']" @click="tab = 'notice'">公告 {{ notices.length }}</button>
      <button :class="['fm-chip', tab === 'prize' ? 'active' : '']" @click="tab = 'prize'">奖品 {{ prizes.length }}</button>
      <button :class="['fm-chip', tab === 'exchange' ? 'active' : '']" @click="tab = 'exchange'">兑换 {{ redemptions.length }}</button>
    </div>
    <div class="fm-section">
      <div v-if="loading" class="fm-loading">正在加载…</div>
      <template v-else>
        <template v-if="tab === 'notice'">
          <div class="fm-card" v-for="item in notices" :key="item.id">
            <b>{{ item.title }}</b>
            <p class="fm-muted" style="margin:6px 0 0">{{ item.content }}</p>
            <p class="fm-muted">{{ item.createdAt }}</p>
          </div>
          <div class="fm-empty" v-if="!notices.length"><p>暂无公告</p></div>
        </template>

        <template v-else-if="tab === 'prize'">
          <div class="fm-list">
            <div class="fm-row" v-for="prize in prizes" :key="prize.id">
              <img class="fm-thumb" :src="prize.imageUrl" :alt="prize.name">
              <div class="fm-row-main">
                <p class="fm-row-title">{{ prize.name }}</p>
                <p class="fm-row-desc">{{ prize.costPoints }} 积分 · 剩余 {{ prize.stock }}</p>
              </div>
              <span class="fm-badge" :class="prize.status === 'on' ? 'is-ok' : 'is-muted'">
                {{ prize.status === 'on' ? '可兑换' : '已下架' }}
              </span>
            </div>
          </div>
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
            <button v-if="item.status === 'pending'" class="fm-btn fm-btn-sm fm-btn-primary" @click="issue(item)">确认发放</button>
          </div>
          <div class="fm-empty" v-if="!redemptions.length"><p>暂无兑换记录</p></div>
        </template>
      </template>
    </div>
    <div class="fm-section">
      <button class="fm-btn fm-btn-danger fm-btn-block" @click="logout">退出登录</button>
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
    <div class="fm-auth-logo" style="background:linear-gradient(135deg,#2f9e5f,#63b86b)"></div>
    <h1>果子来了</h1>
    <p class="fm-auth-sub">商户工作台 · 管理商品上下架、会员余额、预约订单与门店公告</p>
    <div class="fm-field">
      <label class="fm-label">商户手机号</label>
      <input class="fm-input" type="tel" maxlength="11" v-model.trim="form.phone" placeholder="请输入商户账号">
    </div>
    <div class="fm-field">
      <label class="fm-label">密码</label>
      <input class="fm-input" type="password" v-model="form.password">
    </div>
    <button class="fm-btn fm-btn-leaf fm-btn-block fm-btn-lg" :disabled="submitting" @click="submit">
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
  data() { return { Auth, R, resolved: { route: ROUTES[0], params: {} }, tabs: TABS }; },
  computed: {
    view() {
      if (!Auth.user || !Auth.user.isMerchant) return 'mc-auth';
      return this.resolved.route.view;
    },
    showTab() { return !!Auth.user && Auth.user.isMerchant && R.path !== '/auth'; },
    activeTab() { return R.path; },
  },
  created() { router.onStart((r) => { this.resolved = resolve(r.path); }); },
  methods: { go(path) { router.navigate(path); } },
  template: `
  <div class="fm-app">
    <div class="fm-body">
      <component :is="view" :key="R.path"></component>
    </div>
    <nav class="fm-tabbar" v-if="showTab">
      <button v-for="tab in tabs" :key="tab.path"
              :class="['fm-tab', activeTab === tab.path ? 'active' : '']" @click="go(tab.path)">
        <span class="fm-tab-dot"></span>{{ tab.label }}
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
 * P0 核心业务闭环
 *   1) 新增商品：POST /merchant/products
 *      { name, category, priceCents, originPriceCents, unit, stock, description, imageUrl, status }
 *      当前入口按钮只是提示，需要把 McProducts 的表单抽成「新增/编辑」通用弹层。
 *   2) 商品图片：目前只能手填 imageUrl。移动端应支持拍照上传，
 *      需后端同学先提供 POST /merchant/upload（multipart）→ 返回 { url }，再在此接入。
 *   3) 删除商品：DELETE /merchant/products/<id>/delete（注意有历史订单的商品不建议删，改为下架）
 * P1 运营能力
 *   4) 公告增删改：POST/PUT/DELETE /merchant/announcements（当前 McMore 只有只读列表）
 *   5) 奖品增删改：POST/PUT/DELETE /merchant/prizes（含 costPoints、stock 编辑）
 *   6) 兑换「取消并退还积分」：POST /redemptions/<id>/status { status:'cancelled' }
 *   7) 订单批量处理：列表加多选 + 批量确认/完成（后端现有接口是单条，可循环调用）
 * P2 经营分析
 *   8) 概览页加营收趋势图（需后端补 /merchant/stats/trend 提供按天营收）
 *   9) 订单列表支持按日期筛选（需后端 /orders 增加 dateFrom/dateTo 参数）
 *
 * 只允许改：mobile/merchant/**。共享层 mobile/shared/** 只读，
 * 需要新增通用能力请先在群里同步，不要复制一份改过的共享层副本。
 * ==========================================================================*/
