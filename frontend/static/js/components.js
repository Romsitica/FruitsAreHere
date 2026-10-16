/* 通用组件：导航栏、弹窗、空状态、商品卡片、状态徽章 */
const STATUS_MAP = {
  pending: { text: '待确认', cls: 'badge-warn' },
  confirmed: { text: '已确认', cls: 'badge-info' },
  completed: { text: '已完成', cls: 'badge-ok' },
  cancelled: { text: '已取消', cls: 'badge-muted' },
  done: { text: '已发放', cls: 'badge-ok' },
};

const AppNavbar = {
  data() {
    return { Auth, Router };
  },
  methods: {
    navigate,
    doLogout,
    fmtMoney,
    fmtPoints,
  },
  template: `
  <nav class="app-nav">
    <div class="container nav-inner">
      <a class="brand" href="#/">
        <span class="brand-mark"></span>
        <span class="brand-text">果子来了<small>预约订购平台</small></span>
      </a>
      <div class="nav-links">
        <a href="#/" :class="['nav-link', Router.path === '/' ? 'active' : '']">鲜果商城</a>
        <a href="#/orders" :class="['nav-link', Router.path === '/orders' ? 'active' : '']">我的预约</a>
        <a href="#/points" :class="['nav-link', Router.path === '/points' ? 'active' : '']">积分兑换</a>
        <a href="#/account" :class="['nav-link', Router.path === '/account' ? 'active' : '']">我的账户</a>
        <a v-if="Auth.user && Auth.user.isMerchant" href="#/admin"
           :class="['nav-link', 'nav-link-admin', Router.path === '/admin' ? 'active' : '']">商户后台</a>
      </div>
      <div class="nav-user">
        <template v-if="Auth.user">
          <span class="nav-user-meta">
            <b>{{ Auth.user.nickname }}</b>
            <em v-if="!Auth.user.isMerchant">余额 {{ fmtMoney(Auth.user.balanceCents) }} · 积分 {{ fmtPoints(Auth.user.points) }}</em>
            <em v-else>商户账户</em>
          </span>
          <button class="btn btn-outline-secondary btn-sm" @click="doLogout">退出</button>
        </template>
        <template v-else>
          <a class="btn btn-outline-secondary btn-sm" href="#/login">登录</a>
          <a class="btn btn-brand btn-sm" href="#/register">注册会员</a>
        </template>
      </div>
    </div>
  </nav>`,
};

const AppModal = {
  props: { title: { type: String, default: '' }, size: { type: String, default: 'md' } },
  emits: ['close'],
  template: `
  <div>
    <div class="modal-backdrop-sheet" @click="$emit('close')"></div>
    <div class="modal d-block modal-sheet" tabindex="-1" @click.self="$emit('close')">
      <div class="modal-dialog modal-dialog-centered" :class="'modal-' + size">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ title }}</h5>
            <button type="button" class="btn-close" @click="$emit('close')"></button>
          </div>
          <div class="modal-body"><slot></slot></div>
          <div class="modal-footer" v-if="$slots.footer"><slot name="footer"></slot></div>
        </div>
      </div>
    </div>
  </div>`,
};

const EmptyState = {
  props: { text: { type: String, default: '暂无数据' }, hint: { type: String, default: '' } },
  template: `
  <div class="empty-state">
    <div class="empty-ring"></div>
    <p class="empty-text">{{ text }}</p>
    <p class="empty-hint" v-if="hint">{{ hint }}</p>
    <slot></slot>
  </div>`,
};

const StatusBadge = {
  props: { status: { type: String, default: '' }, text: { type: String, default: '' } },
  computed: {
    info() {
      return STATUS_MAP[this.status] || { text: this.status, cls: 'badge-muted' };
    },
  },
  template: `<span class="chip" :class="info.cls">{{ text || info.text }}</span>`,
};

const ProductCard = {
  props: { product: { type: Object, required: true } },
  methods: {
    open() { navigate('/product/' + this.product.id); },
    fmtMoney,
  },
  template: `
  <article class="fruit-card" @click="open">
    <div class="fruit-thumb">
      <img :src="product.imageUrl" :alt="product.name" loading="lazy">
      <span class="fruit-tag">{{ product.category }}</span>
      <span class="fruit-stock" v-if="product.stock <= 10">仅剩 {{ product.stock }} {{ product.unit.split('/')[0].trim() }}</span>
    </div>
    <div class="fruit-body">
      <h3 class="fruit-name">{{ product.name }}</h3>
      <p class="fruit-desc">{{ product.description }}</p>
      <div class="fruit-meta">
        <span class="fruit-price">{{ fmtMoney(product.priceCents) }}</span>
        <span class="fruit-unit">/ {{ product.unit }}</span>
        <span class="fruit-origin" v-if="product.originPriceCents > product.priceCents">{{ fmtMoney(product.originPriceCents) }}</span>
      </div>
      <div class="fruit-foot">
        <span class="text-muted">已售 {{ product.sales }}</span>
        <button class="btn btn-brand btn-sm" @click.stop="open">立即预约</button>
      </div>
    </div>
  </article>`,
};
