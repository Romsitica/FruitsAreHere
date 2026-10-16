/* 用户端页面：商城首页、商品详情、注册登录、我的预约、积分兑换、我的账户 */

const ClientHome = {
  data() {
    return {
      Auth,
      products: [],
      categories: [],
      announcements: [],
      keyword: '',
      category: '全部',
      loading: true,
      activeNotice: 0,
    };
  },
  created() {
    this.load();
  },
  methods: {
    navigate,
    fmtMoney,
    async load() {
      this.loading = true;
      try {
        const query = new URLSearchParams();
        if (this.keyword) query.set('keyword', this.keyword);
        if (this.category && this.category !== '全部') query.set('category', this.category);
        const [goods, notices] = await Promise.all([
          api.get('/products?' + query.toString()),
          api.get('/announcements'),
        ]);
        this.products = goods.products;
        this.categories = ['全部'].concat(goods.categories || []);
        this.announcements = notices.announcements;
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    pickCategory(name) {
      this.category = name;
      this.load();
    },
    search() {
      this.load();
    },
    preview(product) {
      navigate('/product/' + product.id);
    },
  },
  template: `
  <div>
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-copy">
          <span class="hero-badge">当日现摘 · 到店自提</span>
          <h1>好水果，<span>预约</span>着吃</h1>
          <p>会员手机号一键注册，在线预约锁定库存，完成订单累计积分兑换好礼。</p>
          <div class="hero-actions">
            <a class="btn btn-brand" href="#/register">免费注册会员</a>
            <a class="btn btn-ghost" href="#/points">积分兑换奖品</a>
          </div>
          <ul class="hero-points">
            <li><b>1 元 = 1 积分</b><span>订单完成即到账</span></li>
            <li><b>余额支付</b><span>会员账户可直接抵扣</span></li>
            <li><b>预约自提</b><span>到店即取不排队</span></li>
          </ul>
        </div>
        <div class="hero-notice" v-if="announcements.length">
          <div class="notice-head">
            <span class="notice-dot"></span>门店公告
            <span class="notice-count">{{ announcements.length }} 条</span>
          </div>
          <div class="notice-item" v-for="(item, index) in announcements.slice(0, 3)" :key="item.id">
            <h4>{{ item.title }}</h4>
            <p>{{ item.content }}</p>
            <time>{{ item.createdAt }}</time>
          </div>
        </div>
      </div>
    </section>

    <section class="container section">
      <div class="section-head">
        <div>
          <h2>今日鲜果</h2>
          <p class="section-sub">共 {{ products.length }} 款在售商品，售完即止</p>
        </div>
        <form class="search-box" @submit.prevent="search">
          <input class="form-control" v-model.trim="keyword" placeholder="搜索水果名称 / 关键词">
          <button class="btn btn-brand" type="submit">搜索</button>
        </form>
      </div>

      <div class="chip-row">
        <button v-for="name in categories" :key="name"
                :class="['filter-chip', category === name ? 'active' : '']"
                @click="pickCategory(name)">{{ name }}</button>
      </div>

      <div v-if="loading" class="loading-block">正在加载鲜果…</div>
      <div v-else-if="!products.length">
        <empty-state text="没有找到符合条件的水果" hint="换个关键词或分类试试"></empty-state>
      </div>
      <div v-else class="fruit-grid">
        <product-card v-for="item in products" :key="item.id" :product="item"></product-card>
      </div>
    </section>
  </div>`,
};

const ProductDetail = {
  props: { id: { type: String, required: true } },
  data() {
    return {
      Auth,
      product: null,
      loading: true,
      submitting: false,
      form: {
        quantity: 1,
        pickupTime: defaultPickupTime(),
        payMethod: 'onsite',
        note: '',
      },
    };
  },
  computed: {
    totalCents() {
      return this.product ? this.product.priceCents * this.form.quantity : 0;
    },
    balanceEnough() {
      return !this.Auth.user || this.Auth.user.balanceCents >= this.totalCents;
    },
  },
  created() {
    this.load();
  },
  watch: {
    id() {
      this.load();
    },
  },
  methods: {
    navigate,
    fmtMoney,
    prettyPickup,
    async load() {
      this.loading = true;
      try {
        const data = await api.get('/products/' + this.id);
        this.product = data.product;
      } catch (e) {
        toast(e.message, 'danger');
        navigate('/');
      } finally {
        this.loading = false;
      }
    },
    stepQty(delta) {
      const next = this.form.quantity + delta;
      if (next < 1 || (this.product && next > this.product.stock)) return;
      this.form.quantity = next;
    },
    async submit() {
      if (!requireLogin('/product/' + this.id)) return;
      if (!this.product) return;
      this.submitting = true;
      try {
        const data = await api.post('/orders', {
          productId: this.product.id,
          quantity: this.form.quantity,
          pickupTime: this.form.pickupTime ? this.form.pickupTime.replace('T', ' ') : '',
          payMethod: this.form.payMethod,
          note: this.form.note,
        });
        toast('预约成功，订单号 ' + data.order.orderNo);
        const me = await api.get('/auth/me');
        Auth.user = me.user;
        navigate('/orders');
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.submitting = false;
      }
    },
  },
  template: `
  <div class="container section">
    <div v-if="loading" class="loading-block">正在加载商品…</div>
    <div v-else-if="product" class="detail-wrap">
      <nav class="crumb">
        <a href="#/">鲜果商城</a><span>/</span><em>{{ product.category }}</em><span>/</span>{{ product.name }}
      </nav>
      <div class="row g-4">
        <div class="col-lg-6">
          <div class="detail-photo">
            <img :src="product.imageUrl" :alt="product.name">
          </div>
        </div>
        <div class="col-lg-6">
          <div class="detail-info">
            <span class="chip badge-soft">{{ product.category }}</span>
            <h1>{{ product.name }}</h1>
            <p class="detail-desc">{{ product.description }}</p>
            <div class="detail-price">
              <span class="price-now">{{ fmtMoney(product.priceCents) }}</span>
              <span class="price-unit">/ {{ product.unit }}</span>
              <span class="price-origin" v-if="product.originPriceCents > product.priceCents">{{ fmtMoney(product.originPriceCents) }}</span>
            </div>
            <ul class="detail-stats">
              <li><span>库存</span><b>{{ product.stock }} {{ product.unit.split('/')[0].trim() }}</b></li>
              <li><span>已售</span><b>{{ product.sales }}</b></li>
              <li><span>上架时间</span><b>{{ product.createdAt }}</b></li>
            </ul>

            <div class="order-form">
              <div class="form-row">
                <label>预约数量</label>
                <div class="qty-box">
                  <button class="btn btn-light btn-sm" @click="stepQty(-1)">-</button>
                  <input class="form-control form-control-sm" type="number" min="1" :max="product.stock" v-model.number="form.quantity">
                  <button class="btn btn-light btn-sm" @click="stepQty(1)">+</button>
                  <span class="qty-hint">合计 <b>{{ fmtMoney(totalCents) }}</b></span>
                </div>
              </div>
              <div class="form-row">
                <label>预约取货</label>
                <input class="form-control" type="datetime-local" v-model="form.pickupTime">
              </div>
              <div class="form-row">
                <label>支付方式</label>
                <div class="pay-options">
                  <label :class="['pay-item', form.payMethod === 'onsite' ? 'active' : '']">
                    <input type="radio" value="onsite" v-model="form.payMethod">
                    <span><b>到店支付</b><em>取货时现场结算</em></span>
                  </label>
                  <label :class="['pay-item', form.payMethod === 'balance' ? 'active' : '']">
                    <input type="radio" value="balance" v-model="form.payMethod">
                    <span><b>余额支付</b><em>当前余额 {{ Auth.user ? fmtMoney(Auth.user.balanceCents) : '登录后可用' }}</em></span>
                  </label>
                </div>
                <p class="pay-warn" v-if="form.payMethod === 'balance' && Auth.user && !balanceEnough">
                  余额不足，本次需支付 {{ fmtMoney(totalCents) }}，请选择到店支付或联系门店充值。
                </p>
              </div>
              <div class="form-row">
                <label>备注</label>
                <input class="form-control" v-model.trim="form.note" maxlength="60" placeholder="选填，如：需要帮忙切块">
              </div>
              <button class="btn btn-brand btn-lg w-100" :disabled="submitting || product.stock <= 0"
                      @click="submit">
                {{ product.stock <= 0 ? '暂时缺货' : (submitting ? '提交中…' : '提交预约') }}
              </button>
              <p class="form-tip">提交后门店会尽快确认，取货时间 {{ prettyPickup(form.pickupTime) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`,
};

const LoginPage = {
  data() {
    return { form: { phone: '', password: '' }, submitting: false };
  },
  methods: {
    navigate,
    fill(kind) {
      if (kind === 'member') {
        this.form.phone = '13900000001';
        this.form.password = '123456';
      } else {
        this.form.phone = '13800000000';
        this.form.password = 'admin123';
      }
    },
    async submit() {
      this.submitting = true;
      try {
        const data = await api.post('/auth/login', this.form);
        saveToken(data.token);
        Auth.user = data.user;
        toast('欢迎回来，' + data.user.nickname);
        const redirect = Router.query.redirect;
        navigate(redirect || (data.user.isMerchant ? '/admin' : '/'));
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.submitting = false;
      }
    },
  },
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <h2>会员登录</h2>
      <p class="auth-sub">使用注册手机号登录，管理余额、积分与预约订单</p>
      <form @submit.prevent="submit">
        <div class="mb-3">
          <label class="form-label">手机号</label>
          <input class="form-control" v-model.trim="form.phone" maxlength="11" placeholder="请输入 11 位手机号" required>
        </div>
        <div class="mb-3">
          <label class="form-label">密码</label>
          <input class="form-control" type="password" v-model="form.password" placeholder="请输入密码" required>
        </div>
        <button class="btn btn-brand w-100" :disabled="submitting">{{ submitting ? '登录中…' : '登录' }}</button>
      </form>
      <div class="auth-foot">
        还没有账户？<a href="#/register">立即注册会员</a>
      </div>
      <div class="demo-box">
        <span>演示账号</span>
        <button class="btn btn-light btn-sm" @click="fill('member')">会员 13900000001 / 123456</button>
        <button class="btn btn-light btn-sm" @click="fill('admin')">商户 13800000000 / admin123</button>
      </div>
    </div>
  </div>`,
};

const RegisterPage = {
  data() {
    return { form: { phone: '', password: '', confirm: '', nickname: '' }, submitting: false };
  },
  methods: {
    navigate,
    async submit() {
      if (this.form.password !== this.form.confirm) {
        toast('两次输入的密码不一致', 'danger');
        return;
      }
      this.submitting = true;
      try {
        const data = await api.post('/auth/register', {
          phone: this.form.phone,
          password: this.form.password,
          nickname: this.form.nickname,
        });
        saveToken(data.token);
        Auth.user = data.user;
        toast('注册成功，欢迎加入果子来了');
        navigate('/');
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.submitting = false;
      }
    },
  },
  template: `
  <div class="auth-wrap">
    <div class="auth-card">
      <h2>注册会员</h2>
      <p class="auth-sub">手机号即会员账号，注册后即可预约下单、累计积分</p>
      <form @submit.prevent="submit">
        <div class="mb-3">
          <label class="form-label">手机号</label>
          <input class="form-control" v-model.trim="form.phone" maxlength="11" placeholder="请输入 11 位手机号" required>
        </div>
        <div class="mb-3">
          <label class="form-label">昵称（选填）</label>
          <input class="form-control" v-model.trim="form.nickname" maxlength="16" placeholder="不填则自动生成">
        </div>
        <div class="mb-3">
          <label class="form-label">设置密码</label>
          <input class="form-control" type="password" v-model="form.password" placeholder="至少 6 位" required>
        </div>
        <div class="mb-3">
          <label class="form-label">确认密码</label>
          <input class="form-control" type="password" v-model="form.confirm" placeholder="再次输入密码" required>
        </div>
        <button class="btn btn-brand w-100" :disabled="submitting">{{ submitting ? '提交中…' : '注册并登录' }}</button>
      </form>
      <div class="auth-foot">已有账户？<a href="#/login">返回登录</a></div>
    </div>
  </div>`,
};

const MyOrders = {
  data() {
    return { Auth, orders: [], status: 'all', loading: true };
  },
  created() {
    this.load();
  },
  methods: {
    navigate,
    fmtMoney,
    prettyPickup,
    async load() {
      this.loading = true;
      try {
        const data = await api.get('/orders?status=' + this.status);
        this.orders = data.orders;
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    async cancel(order) {
      if (!window.confirm('确定取消订单 ' + order.orderNo + ' 吗？库存将自动归还。')) return;
      try {
        await api.post('/orders/' + order.id + '/cancel');
        toast('订单已取消');
        const me = await api.get('/auth/me');
        Auth.user = me.user;
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div class="container section">
    <div class="section-head">
      <div>
        <h2>我的预约</h2>
        <p class="section-sub">共 {{ orders.length }} 笔预约记录</p>
      </div>
      <div class="chip-row mb-0">
        <button v-for="item in [['all','全部'],['pending','待确认'],['confirmed','已确认'],['completed','已完成'],['cancelled','已取消']]"
                :key="item[0]" :class="['filter-chip', status === item[0] ? 'active' : '']"
                @click="status = item[0]; load()">{{ item[1] }}</button>
      </div>
    </div>

    <div v-if="loading" class="loading-block">正在加载订单…</div>
    <empty-state v-else-if="!orders.length" text="还没有预约记录" hint="去商城挑几款当季鲜果吧">
      <a class="btn btn-brand btn-sm mt-2" href="#/">去挑水果</a>
    </empty-state>

    <div v-else class="order-list">
      <article class="order-card" v-for="order in orders" :key="order.id">
        <img class="order-thumb" :src="order.imageUrl" :alt="order.productName">
        <div class="order-main">
          <div class="order-top">
            <h3>{{ order.productName }}</h3>
            <status-badge :status="order.status"></status-badge>
          </div>
          <p class="order-line">
            <span>订单号 {{ order.orderNo }}</span>
            <span>{{ fmtMoney(order.unitPriceCents) }} × {{ order.quantity }}</span>
            <span>{{ order.payMethod === 'balance' ? '余额支付' : '到店支付' }}</span>
          </p>
          <p class="order-line">
            <span>预约取货：{{ prettyPickup(order.pickupTime) }}</span>
            <span v-if="order.note">备注：{{ order.note }}</span>
          </p>
          <p class="order-line order-line-sub">
            <span>下单时间 {{ order.createdAt }}</span>
            <span v-if="order.pointsGained">已获 {{ order.pointsGained }} 积分</span>
          </p>
        </div>
        <div class="order-side">
          <span class="order-total">{{ fmtMoney(order.totalCents) }}</span>
          <button v-if="order.status === 'pending' || order.status === 'confirmed'"
                  class="btn btn-outline-secondary btn-sm" @click="cancel(order)">取消预约</button>
        </div>
      </article>
    </div>
  </div>`,
};

const PointsCenter = {
  data() {
    return { Auth, prizes: [], redemptions: [], loading: true, target: null, submitting: false };
  },
  created() {
    this.load();
  },
  methods: {
    navigate,
    fmtMoney,
    fmtPoints,
    async load() {
      this.loading = true;
      try {
        const tasks = [api.get('/prizes')];
        if (Auth.user) tasks.push(api.get('/redemptions'));
        const results = await Promise.all(tasks);
        this.prizes = results[0].prizes;
        this.redemptions = results[1] ? results[1].redemptions : [];
        if (Auth.user) {
          const me = await api.get('/auth/me');
          Auth.user = me.user;
        }
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    ask(prize) {
      if (!requireLogin('/points')) return;
      if (Auth.user.points < prize.costPoints) {
        toast('积分不足，还差 ' + (prize.costPoints - Auth.user.points) + ' 积分', 'danger');
        return;
      }
      this.target = prize;
    },
    async confirmExchange() {
      this.submitting = true;
      try {
        const data = await api.post('/redemptions', { prizeId: this.target.id });
        Auth.user.points = data.redemption.memberPoints;
        toast('兑换成功，请到店领取「' + this.target.name + '」');
        this.target = null;
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.submitting = false;
      }
    },
  },
  template: `
  <div class="container section">
    <div class="points-banner">
      <div>
        <h2>积分兑换</h2>
        <p>在平台预约订购水果，订单完成后按 1 元 = 1 积分累计，可兑换以下好礼。</p>
      </div>
      <div class="points-wallet">
        <span>我的积分</span>
        <b>{{ Auth.user ? fmtPoints(Auth.user.points) : '登录后查看' }}</b>
        <a v-if="!Auth.user" class="btn btn-light btn-sm" href="#/login?redirect=%2Fpoints">去登录</a>
      </div>
    </div>

    <div v-if="loading" class="loading-block">正在加载奖品…</div>
    <div v-else class="prize-grid">
      <article class="prize-card" v-for="prize in prizes" :key="prize.id">
        <img :src="prize.imageUrl" :alt="prize.name" loading="lazy">
        <div class="prize-body">
          <h3>{{ prize.name }}</h3>
          <p>{{ prize.description }}</p>
          <div class="prize-foot">
            <span class="prize-cost">{{ fmtPoints(prize.costPoints) }} 积分</span>
            <span class="prize-stock">剩 {{ prize.stock }} 份</span>
          </div>
          <button class="btn btn-brand w-100" :disabled="prize.stock <= 0" @click="ask(prize)">
            {{ prize.stock <= 0 ? '已兑完' : '立即兑换' }}
          </button>
        </div>
      </article>
    </div>

    <section class="section-inner" v-if="Auth.user">
      <h3 class="block-title">我的兑换记录</h3>
      <div v-if="!redemptions.length">
        <empty-state text="暂无兑换记录"></empty-state>
      </div>
      <div v-else class="table-responsive">
        <table class="table app-table align-middle">
          <thead><tr><th>奖品</th><th>消耗积分</th><th>状态</th><th>兑换时间</th></tr></thead>
          <tbody>
            <tr v-for="item in redemptions" :key="item.id">
              <td>{{ item.prizeName }}</td>
              <td>{{ item.costPoints }}</td>
              <td><status-badge :status="item.status" :text="item.statusText"></status-badge></td>
              <td class="text-muted">{{ item.createdAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <app-modal v-if="target" title="确认兑换" @close="target = null">
      <p class="mb-2">即将使用 <b>{{ target.costPoints }}</b> 积分兑换「<b>{{ target.name }}</b>」。</p>
      <p class="text-muted mb-0">兑换后请到门店凭手机号领取，积分不退还（可联系商户取消）。</p>
      <template #footer>
        <button class="btn btn-outline-secondary" @click="target = null">再想想</button>
        <button class="btn btn-brand" :disabled="submitting" @click="confirmExchange">
          {{ submitting ? '兑换中…' : '确认兑换' }}
        </button>
      </template>
    </app-modal>
  </div>`,
};

const AccountPage = {
  data() {
    return { Auth, profile: { nickname: '' }, balanceLogs: [], pointsLogs: [], tab: 'balance', saving: false };
  },
  async created() {
    if (!Auth.user) return;
    await this.load();
  },
  methods: {
    navigate,
    fmtMoney,
    async load() {
      try {
        const data = await api.get('/auth/me');
        Auth.user = data.user;
        this.profile.nickname = data.user.nickname;
        this.balanceLogs = data.balanceLogs;
        this.pointsLogs = data.pointsLogs;
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
    async saveProfile() {
      this.saving = true;
      try {
        const data = await api.post('/auth/profile', { nickname: this.profile.nickname });
        Auth.user = data.user;
        toast('昵称已更新');
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.saving = false;
      }
    },
  },
  template: `
  <div class="container section">
    <div class="account-head">
      <div class="account-avatar">{{ Auth.user ? Auth.user.nickname.slice(0, 1) : '?' }}</div>
      <div class="account-meta">
        <h2>{{ Auth.user ? Auth.user.nickname : '未登录' }}</h2>
        <p v-if="Auth.user">绑定手机号 {{ Auth.user.phone }} · 注册于 {{ Auth.user.createdAt }}</p>
        <p v-else><a href="#/login">登录</a> 后查看账户信息</p>
      </div>
      <div class="account-cards" v-if="Auth.user">
        <div class="wallet-card">
          <span>账户余额</span>
          <b>{{ fmtMoney(Auth.user.balanceCents) }}</b>
          <em>到店充值后由商户入账</em>
        </div>
        <div class="wallet-card wallet-points">
          <span>我的积分</span>
          <b>{{ Auth.user.points }}</b>
          <em>可兑换门店好礼</em>
        </div>
      </div>
    </div>

    <div class="row g-4" v-if="Auth.user">
      <div class="col-lg-4">
        <div class="panel">
          <h3 class="panel-title">资料设置</h3>
          <label class="form-label">昵称</label>
          <input class="form-control mb-3" v-model.trim="profile.nickname" maxlength="16">
          <label class="form-label">手机号</label>
          <input class="form-control mb-3" :value="Auth.user.phone" disabled>
          <button class="btn btn-brand w-100" :disabled="saving" @click="saveProfile">保存资料</button>
        </div>
      </div>
      <div class="col-lg-8">
        <div class="panel">
          <div class="panel-head">
            <h3 class="panel-title mb-0">账户流水</h3>
            <div class="chip-row mb-0">
              <button :class="['filter-chip', tab === 'balance' ? 'active' : '']" @click="tab = 'balance'">余额明细</button>
              <button :class="['filter-chip', tab === 'points' ? 'active' : '']" @click="tab = 'points'">积分明细</button>
            </div>
          </div>
          <div class="table-responsive mt-3" v-if="tab === 'balance'">
            <table class="table app-table align-middle">
              <thead><tr><th>时间</th><th>事由</th><th>变动</th><th>余额</th></tr></thead>
              <tbody>
                <tr v-for="log in balanceLogs" :key="log.id">
                  <td class="text-muted">{{ log.createdAt }}</td>
                  <td>{{ log.reason }}</td>
                  <td :class="log.changeCents > 0 ? 'text-success' : 'text-danger'">
                    {{ log.changeCents > 0 ? '+' : '' }}{{ fmtMoney(log.changeCents) }}
                  </td>
                  <td>{{ fmtMoney(log.balanceAfter) }}</td>
                </tr>
                <tr v-if="!balanceLogs.length"><td colspan="4" class="text-center text-muted py-4">暂无余额变动</td></tr>
              </tbody>
            </table>
          </div>
          <div class="table-responsive mt-3" v-else>
            <table class="table app-table align-middle">
              <thead><tr><th>时间</th><th>事由</th><th>变动</th><th>积分</th></tr></thead>
              <tbody>
                <tr v-for="log in pointsLogs" :key="log.id">
                  <td class="text-muted">{{ log.createdAt }}</td>
                  <td>{{ log.reason }}</td>
                  <td :class="log.change > 0 ? 'text-success' : 'text-danger'">{{ log.change > 0 ? '+' : '' }}{{ log.change }}</td>
                  <td>{{ log.pointsAfter }}</td>
                </tr>
                <tr v-if="!pointsLogs.length"><td colspan="4" class="text-center text-muted py-4">暂无积分变动</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>`,
};
