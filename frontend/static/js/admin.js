/* 商户端页面：概览、商品上下架、预约订单、会员余额、积分奖品、公告 */

const AdminOverview = {
  data() {
    return { stats: null, pendingOrders: [], loading: true };
  },
  created() {
    this.load();
  },
  methods: {
    fmtMoney,
    fmtPoints,
    navigate,
    async load() {
      this.loading = true;
      try {
        const [stats, orders] = await Promise.all([
          api.get('/merchant/stats'),
          api.get('/orders?status=pending'),
        ]);
        this.stats = stats.stats;
        this.pendingOrders = orders.orders.slice(0, 6);
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
  <div>
    <div v-if="loading" class="loading-block">正在加载经营数据…</div>
    <template v-else-if="stats">
      <div class="stat-grid">
        <div class="stat-card">
          <span>累计营收</span><b>{{ fmtMoney(stats.salesCents) }}</b><em>已完成订单</em>
        </div>
        <div class="stat-card">
          <span>订单总数</span><b>{{ stats.orderCount }}</b><em>待确认 {{ stats.pendingCount }} 笔</em>
        </div>
        <div class="stat-card">
          <span>会员数量</span><b>{{ stats.memberCount }}</b><em>会员余额合计 {{ fmtMoney(stats.balanceCents) }}</em>
        </div>
        <div class="stat-card">
          <span>在售商品</span><b>{{ stats.productOnCount }}</b><em>已下架 {{ stats.productOffCount }} 款</em>
        </div>
        <div class="stat-card">
          <span>累计发放积分</span><b>{{ fmtPoints(stats.pointsIssued) }}</b><em>兑换 {{ stats.redemptionCount }} 次</em>
        </div>
        <div class="stat-card">
          <span>已完成订单</span><b>{{ stats.completedCount }}</b><em>已确认 {{ stats.confirmedCount }} 笔</em>
        </div>
      </div>

      <div class="row g-4 mt-1">
        <div class="col-lg-6">
          <div class="panel">
            <h3 class="panel-title">待确认预约</h3>
            <div v-if="!pendingOrders.length"><empty-state text="暂无待确认预约"></empty-state></div>
            <ul v-else class="mini-list">
              <li v-for="order in pendingOrders" :key="order.id">
                <div>
                  <b>{{ order.productName }}</b>
                  <span>{{ order.memberName }} · {{ order.memberPhone }}</span>
                </div>
                <div class="mini-right">
                  <em>{{ fmtMoney(order.totalCents) }}</em>
                  <span>{{ order.pickupTime || '自提' }}</span>
                </div>
              </li>
            </ul>
            <button class="btn btn-outline-secondary btn-sm mt-2" @click="navigate('/admin?tab=orders')">前往处理</button>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="panel">
            <h3 class="panel-title">热销商品</h3>
            <div v-if="!stats.topProducts.length"><empty-state text="暂无销售数据"></empty-state></div>
            <ul v-else class="mini-list">
              <li v-for="item in stats.topProducts" :key="item.id">
                <div><b>{{ item.name }}</b><span>剩余库存 {{ item.stock }}</span></div>
                <div class="mini-right"><em>已售 {{ item.sales }}</em></div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>`,
};

const AdminProducts = {
  data() {
    return {
      products: [],
      categories: [],
      keyword: '',
      loading: true,
      editing: null,
      saving: false,
    };
  },
  created() {
    this.load();
  },
  methods: {
    fmtMoney,
    yuanToCents,
    centsToYuan,
    async load() {
      this.loading = true;
      try {
        const query = new URLSearchParams({ scope: 'all' });
        if (this.keyword) query.set('keyword', this.keyword);
        const data = await api.get('/products?' + query.toString());
        this.products = data.products;
        this.categories = data.categories || [];
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    openCreate() {
      this.editing = {
        id: null, name: '', category: this.categories[0] || '时令鲜果',
        priceYuan: '', originYuan: '', unit: '盒 / 500g', stock: 50,
        description: '', imageUrl: '', status: 'on',
      };
    },
    openEdit(product) {
      this.editing = {
        id: product.id,
        name: product.name,
        category: product.category,
        priceYuan: this.centsToYuan(product.priceCents),
        originYuan: product.originPriceCents ? this.centsToYuan(product.originPriceCents) : '',
        unit: product.unit,
        stock: product.stock,
        description: product.description,
        imageUrl: product.imageUrl,
        status: product.status,
      };
    },
    async save() {
      const form = this.editing;
      if (!form.name) return toast('请填写商品名称', 'danger');
      if (!form.priceYuan) return toast('请填写售价', 'danger');
      const payload = {
        name: form.name,
        category: form.category,
        priceCents: this.yuanToCents(form.priceYuan),
        originPriceCents: form.originYuan ? this.yuanToCents(form.originYuan) : 0,
        unit: form.unit,
        stock: Number(form.stock) || 0,
        description: form.description,
        imageUrl: form.imageUrl,
        status: form.status,
      };
      this.saving = true;
      try {
        if (form.id) {
          await api.put('/merchant/products/' + form.id, payload);
          toast('商品已更新');
        } else {
          await api.post('/merchant/products', payload);
          toast('商品已上架');
        }
        this.editing = null;
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.saving = false;
      }
    },
    async toggle(product) {
      const next = product.status === 'on' ? 'off' : 'on';
      try {
        await api.post('/products/' + product.id + '/status', { status: next });
        toast(next === 'on' ? '已上架：' + product.name : '已下架：' + product.name);
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
    async remove(product) {
      if (!window.confirm('确定删除商品「' + product.name + '」吗？该操作不可恢复。')) return;
      try {
        await api.del('/merchant/products/' + product.id + '/delete');
        toast('商品已删除');
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <div class="toolbar">
      <form class="search-box" @submit.prevent="load">
        <input class="form-control" v-model.trim="keyword" placeholder="搜索商品名称 / 描述">
        <button class="btn btn-outline-secondary" type="submit">搜索</button>
      </form>
      <button class="btn btn-brand" @click="openCreate">新增商品</button>
    </div>

    <div v-if="loading" class="loading-block">正在加载商品…</div>
    <div v-else class="table-responsive">
      <table class="table app-table align-middle">
        <thead>
          <tr><th>商品</th><th>分类</th><th>售价</th><th>库存</th><th>已售</th><th>状态</th><th class="text-end">操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in products" :key="item.id">
            <td>
              <div class="cell-product">
                <img :src="item.imageUrl" :alt="item.name">
                <div><b>{{ item.name }}</b><span>{{ item.unit }}</span></div>
              </div>
            </td>
            <td>{{ item.category }}</td>
            <td>
              <b class="text-brand">{{ fmtMoney(item.priceCents) }}</b>
              <span class="text-muted ms-1" v-if="item.originPriceCents > item.priceCents">
                <s>{{ fmtMoney(item.originPriceCents) }}</s>
              </span>
            </td>
            <td>{{ item.stock }}</td>
            <td>{{ item.sales }}</td>
            <td>
              <span class="chip" :class="item.status === 'on' ? 'badge-ok' : 'badge-muted'">
                {{ item.status === 'on' ? '已上架' : '已下架' }}
              </span>
            </td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-secondary" @click="toggle(item)">
                {{ item.status === 'on' ? '下架' : '上架' }}
              </button>
              <button class="btn btn-sm btn-outline-secondary ms-1" @click="openEdit(item)">编辑</button>
              <button class="btn btn-sm btn-outline-danger ms-1" @click="remove(item)">删除</button>
            </td>
          </tr>
          <tr v-if="!products.length"><td colspan="7" class="text-center text-muted py-4">暂无商品</td></tr>
        </tbody>
      </table>
    </div>

    <app-modal v-if="editing" :title="editing.id ? '编辑商品' : '新增商品'" size="lg" @close="editing = null">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">商品名称</label>
          <input class="form-control" v-model.trim="editing.name" maxlength="64">
        </div>
        <div class="col-md-6">
          <label class="form-label">分类</label>
          <input class="form-control" v-model.trim="editing.category" list="category-options" maxlength="32">
          <datalist id="category-options">
            <option v-for="name in categories" :key="name" :value="name"></option>
          </datalist>
        </div>
        <div class="col-md-3">
          <label class="form-label">售价（元）</label>
          <input class="form-control" type="number" step="0.01" min="0" v-model="editing.priceYuan">
        </div>
        <div class="col-md-3">
          <label class="form-label">划线价（元）</label>
          <input class="form-control" type="number" step="0.01" min="0" v-model="editing.originYuan">
        </div>
        <div class="col-md-3">
          <label class="form-label">库存</label>
          <input class="form-control" type="number" min="0" v-model="editing.stock">
        </div>
        <div class="col-md-3">
          <label class="form-label">状态</label>
          <select class="form-select" v-model="editing.status">
            <option value="on">上架</option>
            <option value="off">下架</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">规格单位</label>
          <input class="form-control" v-model.trim="editing.unit" placeholder="例：盒 / 500g" maxlength="32">
        </div>
        <div class="col-md-6">
          <label class="form-label">主图地址</label>
          <input class="form-control" v-model.trim="editing.imageUrl" placeholder="https://...">
        </div>
        <div class="col-12">
          <label class="form-label">商品详情</label>
          <textarea class="form-control" rows="3" v-model.trim="editing.description" maxlength="2000"></textarea>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-outline-secondary" @click="editing = null">取消</button>
        <button class="btn btn-brand" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </app-modal>
  </div>`,
};

const AdminOrders = {
  data() {
    return { orders: [], status: 'all', keyword: '', loading: true, detail: null };
  },
  created() {
    this.load();
  },
  methods: {
    fmtMoney,
    prettyPickup,
    async load() {
      this.loading = true;
      try {
        const query = new URLSearchParams({ status: this.status });
        if (this.keyword) query.set('keyword', this.keyword);
        const data = await api.get('/orders?' + query.toString());
        this.orders = data.orders;
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    async change(order, status, label) {
      if (!window.confirm('确定将订单 ' + order.orderNo + ' 标记为「' + label + '」吗？')) return;
      try {
        await api.post('/merchant/orders/' + order.id + '/status', { status });
        toast('订单已' + label);
        this.detail = null;
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <div class="toolbar">
      <div class="chip-row mb-0">
        <button v-for="item in [['all','全部'],['pending','待确认'],['confirmed','已确认'],['completed','已完成'],['cancelled','已取消']]"
                :key="item[0]" :class="['filter-chip', status === item[0] ? 'active' : '']"
                @click="status = item[0]; load()">{{ item[1] }}</button>
      </div>
      <form class="search-box" @submit.prevent="load">
        <input class="form-control" v-model.trim="keyword" placeholder="订单号 / 商品 / 手机号">
        <button class="btn btn-outline-secondary" type="submit">搜索</button>
      </form>
    </div>

    <div v-if="loading" class="loading-block">正在加载预约订单…</div>
    <div v-else class="table-responsive">
      <table class="table app-table align-middle">
        <thead>
          <tr><th>订单号</th><th>会员</th><th>商品</th><th>数量</th><th>金额</th><th>支付</th><th>预约取货</th><th>状态</th><th class="text-end">操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <td><b>{{ order.orderNo }}</b><br><span class="text-muted">{{ order.createdAt }}</span></td>
            <td>{{ order.memberName }}<br><span class="text-muted">{{ order.memberPhone }}</span></td>
            <td>{{ order.productName }}</td>
            <td>{{ order.quantity }}</td>
            <td class="text-brand">{{ fmtMoney(order.totalCents) }}</td>
            <td>{{ order.payMethod === 'balance' ? '余额支付' : '到店支付' }}</td>
            <td>{{ prettyPickup(order.pickupTime) }}</td>
            <td><status-badge :status="order.status" :text="order.statusText"></status-badge></td>
            <td class="text-end text-nowrap">
              <button v-if="order.status === 'pending'" class="btn btn-sm btn-brand"
                      @click="change(order, 'confirmed', '确认')">确认</button>
              <button v-if="order.status === 'pending' || order.status === 'confirmed'" class="btn btn-sm btn-outline-secondary ms-1"
                      @click="change(order, 'completed', '完成')">完成</button>
              <button v-if="order.status === 'pending' || order.status === 'confirmed'" class="btn btn-sm btn-outline-danger ms-1"
                      @click="change(order, 'cancelled', '取消')">取消</button>
              <button class="btn btn-sm btn-outline-secondary ms-1" @click="detail = order">详情</button>
            </td>
          </tr>
          <tr v-if="!orders.length"><td colspan="9" class="text-center text-muted py-4">暂无预约订单</td></tr>
        </tbody>
      </table>
    </div>

    <app-modal v-if="detail" title="订单详情" @close="detail = null">
      <ul class="detail-list">
        <li><span>订单号</span><b>{{ detail.orderNo }}</b></li>
        <li><span>会员</span><b>{{ detail.memberName }}（{{ detail.memberPhone }}）</b></li>
        <li><span>商品</span><b>{{ detail.productName }} × {{ detail.quantity }}</b></li>
        <li><span>成交单价</span><b>{{ fmtMoney(detail.unitPriceCents) }}</b></li>
        <li><span>订单金额</span><b>{{ fmtMoney(detail.totalCents) }}</b></li>
        <li><span>支付方式</span><b>{{ detail.payMethod === 'balance' ? '余额支付（已扣款）' : '到店支付' }}</b></li>
        <li><span>预约取货</span><b>{{ prettyPickup(detail.pickupTime) }}</b></li>
        <li><span>会员备注</span><b>{{ detail.note || '无' }}</b></li>
        <li><span>下单时间</span><b>{{ detail.createdAt }}</b></li>
        <li><span>获得积分</span><b>{{ detail.pointsGained || 0 }}</b></li>
      </ul>
    </app-modal>
  </div>`,
};

const AdminMembers = {
  data() {
    return {
      members: [],
      keyword: '',
      loading: true,
      balanceTarget: null,
      balanceForm: { type: 'in', amount: '', reason: '' },
      detail: null,
      detailData: null,
      saving: false,
    };
  },
  created() {
    this.load();
  },
  methods: {
    fmtMoney,
    async load() {
      this.loading = true;
      try {
        const query = new URLSearchParams();
        if (this.keyword) query.set('keyword', this.keyword);
        const data = await api.get('/merchant/members?' + query.toString());
        this.members = data.members;
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    openBalance(member) {
      this.balanceTarget = member;
      this.balanceForm = { type: 'in', amount: '', reason: '' };
    },
    async submitBalance() {
      const amount = Number(this.balanceForm.amount);
      if (!amount || amount <= 0) return toast('请输入大于 0 的金额', 'danger');
      const changeCents = this.balanceForm.type === 'in' ? yuanToCents(amount) : -yuanToCents(amount);
      this.saving = true;
      try {
        await api.post('/merchant/members/' + this.balanceTarget.id + '/balance', {
          changeCents,
          reason: this.balanceForm.reason || (this.balanceForm.type === 'in' ? '商户充值' : '商户扣减'),
        });
        toast((this.balanceForm.type === 'in' ? '充值' : '扣减') + '成功：' + this.balanceTarget.nickname);
        this.balanceTarget = null;
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.saving = false;
      }
    },
    async openDetail(member) {
      try {
        const data = await api.get('/merchant/members/' + member.id);
        this.detailData = data;
        this.detail = member;
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <div class="toolbar">
      <form class="search-box" @submit.prevent="load">
        <input class="form-control" v-model.trim="keyword" placeholder="手机号 / 昵称">
        <button class="btn btn-outline-secondary" type="submit">搜索</button>
      </form>
      <span class="toolbar-hint">共 {{ members.length }} 位会员</span>
    </div>

    <div v-if="loading" class="loading-block">正在加载会员…</div>
    <div v-else class="table-responsive">
      <table class="table app-table align-middle">
        <thead>
          <tr><th>会员</th><th>账户余额</th><th>积分</th><th>预约单数</th><th>累计消费</th><th>注册时间</th><th class="text-end">操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="member in members" :key="member.id">
            <td><b>{{ member.nickname }}</b><br><span class="text-muted">{{ member.phone }}</span></td>
            <td><b class="text-brand">{{ fmtMoney(member.balanceCents) }}</b></td>
            <td>{{ member.points }}</td>
            <td>{{ member.orderCount }}</td>
            <td>{{ fmtMoney(member.totalSpentCents) }}</td>
            <td class="text-muted">{{ member.createdAt }}</td>
            <td class="text-end text-nowrap">
              <button class="btn btn-sm btn-brand" @click="openBalance(member)">调整余额</button>
              <button class="btn btn-sm btn-outline-secondary ms-1" @click="openDetail(member)">明细</button>
            </td>
          </tr>
          <tr v-if="!members.length"><td colspan="7" class="text-center text-muted py-4">暂无会员</td></tr>
        </tbody>
      </table>
    </div>

    <app-modal v-if="balanceTarget" :title="'调整余额 · ' + balanceTarget.nickname" @close="balanceTarget = null">
      <p class="text-muted">当前余额 <b class="text-brand">{{ fmtMoney(balanceTarget.balanceCents) }}</b></p>
      <div class="mb-3">
        <label class="form-label">操作类型</label>
        <div class="pay-options">
          <label :class="['pay-item', balanceForm.type === 'in' ? 'active' : '']">
            <input type="radio" value="in" v-model="balanceForm.type">
            <span><b>充值 / 增加</b><em>线下收款后入账</em></span>
          </label>
          <label :class="['pay-item', balanceForm.type === 'out' ? 'active' : '']">
            <input type="radio" value="out" v-model="balanceForm.type">
            <span><b>扣减</b><em>不可扣成负数</em></span>
          </label>
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label">金额（元）</label>
        <input class="form-control" type="number" step="0.01" min="0.01" v-model="balanceForm.amount">
      </div>
      <div>
        <label class="form-label">事由</label>
        <input class="form-control" v-model.trim="balanceForm.reason" maxlength="60" placeholder="例：门店充值 100 元赠 10 元">
      </div>
      <template #footer>
        <button class="btn btn-outline-secondary" @click="balanceTarget = null">取消</button>
        <button class="btn btn-brand" :disabled="saving" @click="submitBalance">{{ saving ? '提交中…' : '确认调整' }}</button>
      </template>
    </app-modal>

    <app-modal v-if="detail && detailData" :title="'账户明细 · ' + detail.nickname" size="lg" @close="detail = null; detailData = null">
      <div class="row g-3 mb-3">
        <div class="col-md-4"><div class="wallet-card"><span>余额</span><b>{{ fmtMoney(detailData.member.balanceCents) }}</b></div></div>
        <div class="col-md-4"><div class="wallet-card wallet-points"><span>积分</span><b>{{ detailData.member.points }}</b></div></div>
        <div class="col-md-4"><div class="wallet-card"><span>手机号</span><b class="fs-6">{{ detailData.member.phone }}</b></div></div>
      </div>
      <h4 class="block-title">余额流水</h4>
      <div class="table-responsive">
        <table class="table app-table table-sm align-middle">
          <thead><tr><th>时间</th><th>事由</th><th>变动</th><th>余额</th><th>操作人</th></tr></thead>
          <tbody>
            <tr v-for="log in detailData.balanceLogs" :key="log.id">
              <td class="text-muted">{{ log.createdAt }}</td>
              <td>{{ log.reason }}</td>
              <td :class="log.changeCents > 0 ? 'text-success' : 'text-danger'">
                {{ log.changeCents > 0 ? '+' : '' }}{{ fmtMoney(log.changeCents) }}
              </td>
              <td>{{ fmtMoney(log.balanceAfter) }}</td>
              <td class="text-muted">{{ log.operator }}</td>
            </tr>
            <tr v-if="!detailData.balanceLogs.length"><td colspan="5" class="text-center text-muted py-3">暂无流水</td></tr>
          </tbody>
        </table>
      </div>
      <h4 class="block-title mt-3">近期预约</h4>
      <div class="table-responsive">
        <table class="table app-table table-sm align-middle">
          <thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="order in detailData.orders" :key="order.id">
              <td>{{ order.orderNo }}</td>
              <td>{{ order.productName }} × {{ order.quantity }}</td>
              <td>{{ fmtMoney(order.totalCents) }}</td>
              <td><status-badge :status="order.status" :text="order.statusText"></status-badge></td>
              <td class="text-muted">{{ order.createdAt }}</td>
            </tr>
            <tr v-if="!detailData.orders.length"><td colspan="5" class="text-center text-muted py-3">暂无预约</td></tr>
          </tbody>
        </table>
      </div>
    </app-modal>
  </div>`,
};

const AdminPrizes = {
  data() {
    return { prizes: [], loading: true, editing: null, saving: false };
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await api.get('/prizes?scope=all');
        this.prizes = data.prizes;
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    openCreate() {
      this.editing = { id: null, name: '', costPoints: 100, stock: 10, description: '', imageUrl: '', status: 'on' };
    },
    openEdit(prize) {
      this.editing = { ...prize };
    },
    async save() {
      const form = this.editing;
      if (!form.name) return toast('请填写奖品名称', 'danger');
      const payload = {
        name: form.name,
        costPoints: Number(form.costPoints) || 1,
        stock: Number(form.stock) || 0,
        description: form.description,
        imageUrl: form.imageUrl,
        status: form.status,
      };
      this.saving = true;
      try {
        if (form.id) {
          await api.put('/merchant/prizes/' + form.id, payload);
          toast('奖品已更新');
        } else {
          await api.post('/merchant/prizes', payload);
          toast('奖品已创建');
        }
        this.editing = null;
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.saving = false;
      }
    },
    async toggle(prize) {
      try {
        await api.put('/merchant/prizes/' + prize.id, {
          status: prize.status === 'on' ? 'off' : 'on',
        });
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
    async remove(prize) {
      if (!window.confirm('确定删除奖品「' + prize.name + '」吗？')) return;
      try {
        await api.del('/merchant/prizes/' + prize.id + '/delete');
        toast('奖品已删除');
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <div class="toolbar">
      <span class="toolbar-hint">共 {{ prizes.length }} 个奖品</span>
      <button class="btn btn-brand" @click="openCreate">新增奖品</button>
    </div>
    <div v-if="loading" class="loading-block">正在加载奖品…</div>
    <div v-else class="table-responsive">
      <table class="table app-table align-middle">
        <thead><tr><th>奖品</th><th>所需积分</th><th>库存</th><th>状态</th><th>创建时间</th><th class="text-end">操作</th></tr></thead>
        <tbody>
          <tr v-for="prize in prizes" :key="prize.id">
            <td>
              <div class="cell-product">
                <img :src="prize.imageUrl" :alt="prize.name">
                <div><b>{{ prize.name }}</b><span>{{ prize.description }}</span></div>
              </div>
            </td>
            <td class="text-brand">{{ prize.costPoints }}</td>
            <td>{{ prize.stock }}</td>
            <td><span class="chip" :class="prize.status === 'on' ? 'badge-ok' : 'badge-muted'">{{ prize.status === 'on' ? '可兑换' : '已下架' }}</span></td>
            <td class="text-muted">{{ prize.createdAt }}</td>
            <td class="text-end text-nowrap">
              <button class="btn btn-sm btn-outline-secondary" @click="toggle(prize)">{{ prize.status === 'on' ? '下架' : '上架' }}</button>
              <button class="btn btn-sm btn-outline-secondary ms-1" @click="openEdit(prize)">编辑</button>
              <button class="btn btn-sm btn-outline-danger ms-1" @click="remove(prize)">删除</button>
            </td>
          </tr>
          <tr v-if="!prizes.length"><td colspan="6" class="text-center text-muted py-4">暂无奖品</td></tr>
        </tbody>
      </table>
    </div>

    <app-modal v-if="editing" :title="editing.id ? '编辑奖品' : '新增奖品'" @close="editing = null">
      <div class="row g-3">
        <div class="col-md-8">
          <label class="form-label">奖品名称</label>
          <input class="form-control" v-model.trim="editing.name" maxlength="64">
        </div>
        <div class="col-md-4">
          <label class="form-label">所需积分</label>
          <input class="form-control" type="number" min="1" v-model="editing.costPoints">
        </div>
        <div class="col-md-4">
          <label class="form-label">库存</label>
          <input class="form-control" type="number" min="0" v-model="editing.stock">
        </div>
        <div class="col-md-4">
          <label class="form-label">状态</label>
          <select class="form-select" v-model="editing.status">
            <option value="on">可兑换</option>
            <option value="off">已下架</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label">图片地址</label>
          <input class="form-control" v-model.trim="editing.imageUrl">
        </div>
        <div class="col-12">
          <label class="form-label">奖品说明</label>
          <input class="form-control" v-model.trim="editing.description" maxlength="255">
        </div>
      </div>
      <template #footer>
        <button class="btn btn-outline-secondary" @click="editing = null">取消</button>
        <button class="btn btn-brand" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </app-modal>
  </div>`,
};

const AdminRedemptions = {
  data() {
    return { items: [], status: 'all', loading: true };
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await api.get('/redemptions?status=' + this.status);
        this.items = data.redemptions;
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    async change(item, status, label) {
      if (!window.confirm('确定将该兑换记录标记为「' + label + '」吗？')) return;
      try {
        await api.post('/redemptions/' + item.id + '/status', { status });
        toast('已' + label);
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <div class="toolbar">
      <div class="chip-row mb-0">
        <button v-for="item in [['all','全部'],['pending','待发放'],['done','已发放'],['cancelled','已取消']]"
                :key="item[0]" :class="['filter-chip', status === item[0] ? 'active' : '']"
                @click="status = item[0]; load()">{{ item[1] }}</button>
      </div>
      <span class="toolbar-hint">共 {{ items.length }} 条兑换记录</span>
    </div>
    <div v-if="loading" class="loading-block">正在加载兑换记录…</div>
    <div v-else class="table-responsive">
      <table class="table app-table align-middle">
        <thead><tr><th>会员</th><th>奖品</th><th>消耗积分</th><th>状态</th><th>兑换时间</th><th class="text-end">操作</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.memberName }}<br><span class="text-muted">{{ item.memberPhone }}</span></td>
            <td>{{ item.prizeName }}</td>
            <td>{{ item.costPoints }}</td>
            <td><status-badge :status="item.status" :text="item.statusText"></status-badge></td>
            <td class="text-muted">{{ item.createdAt }}</td>
            <td class="text-end text-nowrap">
              <template v-if="item.status === 'pending'">
                <button class="btn btn-sm btn-brand" @click="change(item, 'done', '发放')">确认发放</button>
                <button class="btn btn-sm btn-outline-danger ms-1" @click="change(item, 'cancelled', '取消并退还积分')">取消</button>
              </template>
              <span v-else class="text-muted">—</span>
            </td>
          </tr>
          <tr v-if="!items.length"><td colspan="6" class="text-center text-muted py-4">暂无兑换记录</td></tr>
        </tbody>
      </table>
    </div>
  </div>`,
};

const AdminAnnouncements = {
  data() {
    return { items: [], loading: true, editing: null, saving: false };
  },
  created() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await api.get('/announcements');
        this.items = data.announcements;
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.loading = false;
      }
    },
    openCreate() {
      this.editing = { id: null, title: '', content: '' };
    },
    openEdit(item) {
      this.editing = { ...item };
    },
    async save() {
      const form = this.editing;
      if (!form.title) return toast('请填写公告标题', 'danger');
      this.saving = true;
      try {
        if (form.id) {
          await api.put('/merchant/announcements/' + form.id, { title: form.title, content: form.content });
          toast('公告已更新');
        } else {
          await api.post('/merchant/announcements', { title: form.title, content: form.content });
          toast('公告已发布');
        }
        this.editing = null;
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        this.saving = false;
      }
    },
    async remove(item) {
      if (!window.confirm('确定删除公告「' + item.title + '」吗？')) return;
      try {
        await api.del('/merchant/announcements/' + item.id + '/delete');
        toast('公告已删除');
        this.load();
      } catch (e) {
        toast(e.message, 'danger');
      }
    },
  },
  template: `
  <div>
    <div class="toolbar">
      <span class="toolbar-hint">共 {{ items.length }} 条公告，最新的 3 条会展示在客户端首页</span>
      <button class="btn btn-brand" @click="openCreate">发布公告</button>
    </div>
    <div v-if="loading" class="loading-block">正在加载公告…</div>
    <div v-else class="notice-admin-list">
      <article class="notice-admin-card" v-for="item in items" :key="item.id">
        <div class="notice-admin-head">
          <h4>{{ item.title }}</h4>
          <time>{{ item.createdAt }}</time>
        </div>
        <p>{{ item.content }}</p>
        <div class="notice-admin-foot">
          <button class="btn btn-sm btn-outline-secondary" @click="openEdit(item)">编辑</button>
          <button class="btn btn-sm btn-outline-danger ms-1" @click="remove(item)">删除</button>
        </div>
      </article>
      <empty-state v-if="!items.length" text="暂无公告" hint="发布一条公告，客户端首页即可看到"></empty-state>
    </div>

    <app-modal v-if="editing" :title="editing.id ? '编辑公告' : '发布公告'" @close="editing = null">
      <div class="mb-3">
        <label class="form-label">公告标题</label>
        <input class="form-control" v-model.trim="editing.title" maxlength="128">
      </div>
      <div>
        <label class="form-label">公告内容</label>
        <textarea class="form-control" rows="5" v-model.trim="editing.content" maxlength="2000"></textarea>
      </div>
      <template #footer>
        <button class="btn btn-outline-secondary" @click="editing = null">取消</button>
        <button class="btn btn-brand" :disabled="saving" @click="save">{{ saving ? '提交中…' : '发布' }}</button>
      </template>
    </app-modal>
  </div>`,
};

const AdminConsole = {
  data() {
    return {
      Auth,
      tabs: [
        { key: 'overview', label: '经营概览' },
        { key: 'products', label: '商品管理' },
        { key: 'orders', label: '预约订单' },
        { key: 'members', label: '会员余额' },
        { key: 'prizes', label: '积分奖品' },
        { key: 'redemptions', label: '兑换发放' },
        { key: 'announcements', label: '公告管理' },
      ],
      viewMap: {
        overview: 'admin-overview',
        products: 'admin-products',
        orders: 'admin-orders',
        members: 'admin-members',
        prizes: 'admin-prizes',
        redemptions: 'admin-redemptions',
        announcements: 'admin-announcements',
      },
    };
  },
  computed: {
    tab() {
      return Router.query.tab || 'overview';
    },
    currentView() {
      return this.viewMap[this.tab] || 'admin-overview';
    },
  },
  created() {
    requireMerchant();
  },
  methods: {
    switchTab(key) {
      navigate('/admin?tab=' + key);
    },
  },
  template: `
  <div class="container section admin-console">
    <div class="admin-head">
      <div>
        <h2>商户后台</h2>
        <p class="section-sub">管理商品上下架、会员余额、预约订单与门店公告</p>
      </div>
      <span class="chip badge-soft">{{ Auth.user ? Auth.user.nickname : '' }}</span>
    </div>
    <div class="admin-body">
      <aside class="admin-side">
        <button v-for="item in tabs" :key="item.key"
                :class="['admin-tab', tab === item.key ? 'active' : '']"
                @click="switchTab(item.key)">{{ item.label }}</button>
      </aside>
      <section class="admin-main">
        <component :is="currentView"></component>
      </section>
    </div>
  </div>`,
};
