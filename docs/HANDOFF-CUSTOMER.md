# 客户端交接文档（会员端 `/m/customer/`）

> 更新：2026-11-04 · 后端分支 `Backend`（`3af232e`）
> 你负责：`mobile/customer/**`
> 不要改：`mobile/shared/**`（两端共用的冻结层）、`shop/**`、`fruitmall/**`

---

## 1. 先跑起来

```powershell
cd FruitsAreHere
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

打开 <http://127.0.0.1:8000/m/customer/>。

| 角色 | 手机号 | 密码 | 初始状态 |
|---|---|---|---|
| 会员（小果） | `13900000001` | `123456` | 余额 200 元、积分 120 |
| 商户（配合造数据） | `13800000000` | `admin123` | 用于把订单改成「已完成」发积分 |

`0.0.0.0` 不是 `127.0.0.1`，否则手机连不上。

---

## 2. 你只用这几个接口（8 个）

前缀 `/api`。带 🔒 的需要 `Authorization: Bearer <token>`。

| 方法 | 路径 | 用途 | 返回 |
|---|---|---|---|
| POST | `/auth/register` | 手机号注册 | `{token, user}` |
| POST | `/auth/login` | 登录 | `{token, user}` |
| POST | `/auth/logout` 🔒 | 退出 | `{ok:true}` |
| GET | `/auth/me` 🔒 | 我的余额/积分/流水 | `{user, balanceLogs[], pointsLogs[]}` |
| POST | `/auth/profile` 🔒 | 改昵称 | `{user}` |
| GET | `/products` | 商品列表（只返回上架） | `{products[], categories[]}` |
| GET | `/products/<id>` | 商品详情 | `{product}` |
| GET | `/announcements` | 公告（最新 50 条） | `{announcements[]}` |
| GET | `/orders` 🔒 | 我的预约 | `{orders[]}` |
| POST | `/orders` 🔒 | 提交预约 | `{order}` |
| GET | `/orders/<id>` 🔒 | 订单详情 | `{order}` |
| POST | `/orders/<id>/cancel` 🔒 | 自助取消 | `{order}` |
| GET | `/prizes` | 积分奖品（只返回上架） | `{prizes[]}` |
| GET | `/redemptions` 🔒 | 我的兑换记录 | `{redemptions[]}` |
| POST | `/redemptions` 🔒 | 兑换奖品 | `{redemption, prize}` |
| GET | `/health` | 探活 | `{ok:true}` |

`/products` 支持 `?keyword=&category=`。`/orders` 支持 `?status=pending|confirmed|completed|cancelled|all`。

**商品多图（新）**：`product.images` 是字符串数组（最多 6 张），`product.imageUrl` 是封面。
详情页轮播用 `images`；`images` 为空（老数据）时回退显示 `imageUrl`。

---

## 3. 通用约定

**响应**

```json
{"ok": true,  "product": {...}}
{"ok": false, "error": "中文提示"}   // error 可直接展示给用户
```

**状态码**：`400` 参数/业务错误 · `401` 未登录或令牌失效 · `403` 越权（看别人的订单）· `404` 不存在 · `405` 方法不对。

**类型**

- 金额一律是**分**的整数（`priceCents`、`totalCents`、`balanceCents`），展示前 `/100`；`mobile/shared/api.js` 已提供 `fmtMoney()`。
- 时间一律是字符串 `YYYY-MM-DD HH:MM:SS`。
- 整数参数（数量等）只收 JSON 整数或整数字符串；`1.5` / `true` 会 **400**，不会被静默截断。

**令牌与 401（2026-11-04 修复）**

- 401 只清除「发起这次请求时」那份令牌的登录态。**换号后旧账号迟到的 401 不会再把你踢下线**。
- 错误对象带 `err.status`，可以据此区分 401 与业务错误。
- 所以：401 时跳登录页是安全的；但**不要**用 `err.message` 判断是否 401（用 `err.status`）。

---

## 4. 业务规则（决定交互怎么写）

**订单状态机**

```
pending（待确认）──商户确认──> confirmed（已确认）──商户完成──> completed（已完成，终态）
      │                             │
      └──────────取消───────────────┴──> cancelled（已取消，终态）
```

会员只能在 `pending` / `confirmed` 时取消。

**下单**

- 下单**立即**扣库存与销量；取消会回滚。
- `payMethod`：`balance`（余额支付，下单即扣款）或 `onsite`（到店付）。
- 库存不足返回 400「库存不足，当前仅剩 N 盒」；商品下架返回 400「该商品已下架」；数量范围 1–99。
- **余额判断以服务端为准**：不要用缓存里的 `Auth.user.balanceCents` 提前拦截提交——商户刚充值时缓存还是旧值，会把合法订单拦掉（这正是 2026-11 修过的 C02）。让 `/api/orders` 返回业务错误，成功后刷新 `/auth/me`。

**积分**

- 订单被商户标记「已完成」后发放：`订单金额(元) × 1` 积分，向下取整。
- 兑换即扣积分与奖品库存；记录状态 `pending`（待发放），商户发放后 `done`，商户取消会退积分。
- 同理：**不要用缓存的积分拦截兑换**，交给 `/api/redemptions` 判断（修过的 C03）。

**未读提醒**：客户端的提醒是本地状态，与后端无关；注意换号时清空已读集合（C01 修过的问题，别再改成先清状态后同步账户）。

---

## 5. 现状 vs 待办

以 `origin/master` 的 `mobile/customer/app.js` 为准（2026-11-04）：

**已经做好、不需要重做**：首页/详情/订单/订单详情/积分/积分明细/个人中心/登录页六个组件，
商品详情**多图轮播已实现**（自动读 `product.images`，为空时回退 `imageUrl`），订单详情页、积分明细页也在。

**仍然有效的前端待办（代码注释里写的）**：骨架屏替换 loading 文本、下拉刷新、页面切换动画、tab 图标。

**P0（后端已就绪，检查是否已覆盖）**

1. 商品详情多图轮播 —— 已实现，重点回归「老商品无 `images` 时回退封面」和「超过 6 张时只显示 6 张」
2. 401 统一跳登录（用 `err.status === 401`），保留来路
3. 余额/积分不要用缓存做提交拦截，改为提交后按后端错误提示并刷新账户（C02/C03 的老问题，别改回去）
4. 写操作防重复提交（下单、兑换）
5. 空态与错误态：直接展示后端 `error` 文案

**P1（要等后端，现在做不了）**

| 需求 | 现状 |
|---|---|
| 列表分页 / 下拉加载更多 | 接口一次返回全部，`/orders` 上限 300 条 |
| 修改密码 | 无接口 |
| 取货码/二维码 | 无接口 |

---

## 6. 验收清单

| # | 操作 | 预期 |
|---|---|---|
| 1 | `13900000001 / 123456` 登录 | 首页出现 3 条公告与商品 |
| 2 | 商品详情（已实现轮播） | 多图商品能左右滑动并带动圆点；只有 `imageUrl` 的老商品正常显示单图 |
| 3 | 下 2 件、余额支付 | 下单成功；账户余额减 `2×单价`；库存减 2 |
| 4 | 同商品下 99 件 | 400「库存不足，当前仅剩 N 盒」，无订单生成 |
| 5 | 我的预约 → 取消刚下的单 | 状态变已取消；余额退回；库存回滚 |
| 6 | 让商户把订单改成「已完成」→ 刷新 | 状态已完成；积分 `+订单金额(元)` |
| 7 | 用别人订单 id 调 `/api/orders/<id>` | 403，页面提示无权限 |
| 8 | 余额为 0 时打开商品页，商户后台充值后**不刷新页面**直接下单 | 下单成功（不再被缓存余额拦住） |
| 9 | 换号登录后，旧账号的请求才返回 401 | 新账号**不会**被踢下线 |

---

## 7. 联调

手机同一 WiFi：

1. 后端 `runserver 0.0.0.0:8000`；
2. `ipconfig` 找 IPv4（如 `192.168.1.10`）；
3. 手机开 `http://192.168.1.10:8000/m/customer/?api=http://192.168.1.10:8000/api`（`?api=` 会被记住）。

改完不生效先 `Ctrl+F5` 强刷。

---

## 8. 协作

1. 不要改 `mobile/shared/**`；需要新能力先在群里提，由后端确认后统一改。
2. 接口只加不改；字段名以 `mobile/shared/api.js` 顶部注释为准。
3. 分支：`git switch -c feat/<模块>` → 提交 → 推送 → 提 PR 到 `master`，别直接推 `master`。
4. 提交前按第 6 节自查一遍。

---

## 9. 近期后端变化（会影响你）

| 日期 | 变化 | 对你意味着 |
|---|---|---|
| 10-21 | 未注册 `/api/*` 返回 JSON 404（以前是 200 + HTML） | 拼错路径能立刻看出，不再报「网络错误」 |
| 10-21 | 错误文案去掉重复的「已」 | 可直接展示 |
| 11-04 | 商品支持 `images` 多图 | 可以做轮播 |
| 11-04 | 401 只清发起请求时的登录态 | 换号不再被误踢 |
| 11-04 | 整数参数拒绝小数/布尔 | 数量传 1.5 会 400 |
