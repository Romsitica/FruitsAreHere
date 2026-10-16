/* 应用入口：路由匹配、登录守卫、组件注册与挂载 */

const ROUTES = [
  { name: 'home', pattern: /^\/$/, view: 'client-home' },
  { name: 'product', pattern: /^\/product\/(\d+)$/, view: 'product-detail', params: ['id'] },
  { name: 'login', pattern: /^\/login$/, view: 'login-page' },
  { name: 'register', pattern: /^\/register$/, view: 'register-page' },
  { name: 'orders', pattern: /^\/orders$/, view: 'my-orders', auth: true },
  { name: 'points', pattern: /^\/points$/, view: 'points-center' },
  { name: 'account', pattern: /^\/account$/, view: 'account-page', auth: true },
  { name: 'admin', pattern: /^\/admin$/, view: 'admin-console', auth: true },
];

function resolveRoute(path) {
  for (const route of ROUTES) {
    const matched = path.match(route.pattern);
    if (matched) {
      const params = {};
      (route.params || []).forEach((key, index) => {
        params[key] = matched[index + 1];
      });
      return { route, params };
    }
  }
  return { route: ROUTES[0], params: {} };
}

const App = {
  data() {
    return {
      Auth,
      Toast,
      Router,
      resolved: { route: ROUTES[0], params: {} },
    };
  },
  computed: {
    viewName() {
      return this.resolved.route.view;
    },
  },
  created() {
    this.sync();
    window.addEventListener('hashchange', () => this.sync());
  },
  methods: {
    sync() {
      const target = resolveRoute(Router.path);
      if (target.route.auth && !Auth.user) {
        navigate('/login?redirect=' + encodeURIComponent(Router.path));
        return;
      }
      this.resolved = target;
    },
  },
  template: `
  <div class="app-shell">
    <app-navbar></app-navbar>
    <main class="app-main">
      <component :is="viewName" v-bind="resolved.params" :key="Router.path"></component>
    </main>
    <footer class="app-foot">
      <div class="container foot-inner">
        <div>
          <b>果子来了</b> · 水果店铺商品展示与预约订购会员平台
        </div>
        <div class="foot-links">
          <a href="#/">鲜果商城</a>
          <a href="#/points">积分兑换</a>
          <a href="#/orders">我的预约</a>
          <a href="#/account">我的账户</a>
          <a href="#/admin">商户后台</a>
        </div>
      </div>
    </footer>
    <div class="toast-host">
      <div v-for="item in Toast.list" :key="item.id" class="app-toast" :class="'toast-' + item.type">
        {{ item.message }}
      </div>
    </div>
  </div>`,
};

const COMPONENTS = {
  'app-navbar': AppNavbar,
  'app-modal': AppModal,
  'empty-state': EmptyState,
  'status-badge': StatusBadge,
  'product-card': ProductCard,
  'client-home': ClientHome,
  'product-detail': ProductDetail,
  'login-page': LoginPage,
  'register-page': RegisterPage,
  'my-orders': MyOrders,
  'points-center': PointsCenter,
  'account-page': AccountPage,
  'admin-console': AdminConsole,
  'admin-overview': AdminOverview,
  'admin-products': AdminProducts,
  'admin-orders': AdminOrders,
  'admin-members': AdminMembers,
  'admin-prizes': AdminPrizes,
  'admin-redemptions': AdminRedemptions,
  'admin-announcements': AdminAnnouncements,
};

(async function main() {
  parseHash();
  await bootstrapAuth();

  const app = Vue.createApp(App);
  Object.keys(COMPONENTS).forEach((name) => app.component(name, COMPONENTS[name]));
  app.mount('#app');
})();
