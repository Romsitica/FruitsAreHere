# 客户移动端与后端接口约定

核对日期：2026-11-04。已同步主分支 `7ac2368`，依据 `docs/FRONTEND-HANDOFF.md` 及实际 `shop/api_urls.py`、`shop/api.py`、`shop/models.py` 核对。

## 接入方式

客户端 `app.js` 的 `CustomerAPI` 是业务调用入口；网络请求复用只读 `mobile/shared/api.js`，不复制共享客户端。

- 本地地址：`http://127.0.0.1:9000/m/customer/`。
- 默认 API 根路径：同源 `/api`；客户网页路由使用 `#/orders/1`，接口则是 `/api/orders/1`。
- 指向其他后端：访问 `/m/customer/?api=http://后端主机:端口/api`，共享层会记住该地址。
- 请求体为 JSON，`Content-Type: application/json`。
- 登录后自动携带 `Authorization: Bearer <token>`；客户令牌使用 `fm_customer_token` 存储。
- 成功响应为 `{ "ok": true, ...业务字段 }`；失败响应为 `{ "ok": false, "error": "错误说明" }`，使用实际 HTTP 状态码。共享层将失败转换为异常；401 清除登录态。
- 业务接口 401 时，客户层检测共享层清令牌后的状态，跳转登录并保留当前页面和查询参数；网络失败、403/404 不会当作登录失效。用户主动退出仍回首页。
- 新后端的未知 `/api/**` 路径返回 HTTP 404 JSON `{ "ok": false, "error": "接口不存在" }`，不会返回网页 HTML。
- 所有金额为整数“分”，例如 `priceCents: 2990` 显示为 ¥29.90；数量、积分为整数。时间通常为 `YYYY-MM-DD HH:MM:SS`。

## 账户

- `CustomerAPI.register(phone, password, nickname)` → `POST /auth/register`，请求 `{ phone, password, nickname }`，返回 `{ token, user }`。手机号匹配 `^1[3-9]\d{9}$`，密码 6～64 位，昵称选填、最多 32 字符。
- `CustomerAPI.login(phone, password)` → `POST /auth/login`，请求 `{ phone, password }`，返回 `{ token, user }`。共享层保存令牌与用户信息。
- `CustomerAPI.logout()` → `POST /auth/logout`，需登录，撤销当前令牌；共享层清除本地令牌与账户。
- `CustomerAPI.me()` → `GET /auth/me`，需登录，返回 `{ user, balanceLogs, pointsLogs }`。两类流水分别最多返回最近 20 条。刷新账户时使用客户端 `loadAccount()`，防止换号后迟到响应覆盖账户。
- `CustomerAPI.profile(nickname)` → `POST /auth/profile`，需登录，请求 `{ nickname }`，昵称必填、最多 32 字符，返回 `{ user }`。

`user` 字段：`id, phone, nickname, role, isMerchant, balanceCents, points, createdAt, lastLogin`。
余额流水：`id, changeCents, balanceAfter, reason, operator, createdAt`。
积分流水：`id, change, pointsAfter, reason, operator, createdAt`。

## 商品与公告（无需登录）

- `CustomerAPI.products({ keyword, category })` → `GET /products?keyword=...&category=...`，返回 `{ products, categories }`。参数由 URLSearchParams 编码；“全部”不传 category。客户仅查看在售商品，不传商户 `scope=all`。
- `CustomerAPI.product(id)` → `GET /products/:id`，返回 `{ product }`；不存在返回 404。
- `CustomerAPI.announcements()` → `GET /announcements`，返回 `{ announcements }`。字段为 `id, title, content, createdAt`。

商品字段：`id, name, category, priceCents, originPriceCents, unit, stock, sales, description, imageUrl, status, createdAt, updatedAt`。

## 预约（需登录）

- `CustomerAPI.orders(status)` → `GET /orders?status=...`，默认 `all`，支持 `pending / confirmed / completed / cancelled`，返回 `{ orders }`，后端最多返回 300 条；会员仅查看本人订单。
- `CustomerAPI.order(id)` → `GET /orders/:id`，返回 `{ order }`；不存在返回 404，无权查看返回 403。
- `CustomerAPI.reserve(payload)` → `POST /orders`，请求如下，返回 `{ order }`：

```json
{
  "productId": 3,
  "quantity": 2,
  "pickupTime": "2026-11-02 10:00",
  "payMethod": "balance",
  "note": "需要帮忙切块"
}
```

`productId` 使用实际列表返回的 ID；单笔数量 1～99 且不超过库存；`pickupTime` 可为空；`payMethod` 为 `onsite`（到店支付）或 `balance`（余额支付）；`note` 最多 128 字符。金额由后端计算，客户端不传 totalCents。下单锁定库存；余额支付立即扣款，客户端成功后重新查询账户。

- `CustomerAPI.cancel(id)` → `POST /orders/:id/cancel`，返回 `{ order }`。本人待确认或已确认订单可取消；恢复库存，余额支付原额退回。已完成/已取消订单再次取消会返回业务错误。

订单字段：`id, orderNo, userId, memberName, memberPhone, productId, productName, imageUrl, unitPriceCents, quantity, totalCents, pickupTime, payMethod, status, statusText, pointsGained, note, createdAt, updatedAt`。
提醒轮询也使用 `CustomerAPI.orders()`；商户确认状态为 `confirmed`，客户端不自行将订单改为完成。后端完成订单时发放 `totalCents // 100` 积分。

## 积分与奖品

- `CustomerAPI.prizes()` → `GET /prizes`，无需登录，返回 `{ prizes }`；奖品字段：`id, name, costPoints, stock, description, imageUrl, status, createdAt`。
- `CustomerAPI.redemptions()` → `GET /redemptions`，需登录，返回 `{ redemptions }`；会员仅查看本人记录。
- `CustomerAPI.redeem(prizeId)` → `POST /redemptions`，需登录，请求 `{ prizeId }`，返回 `{ redemption, prize }`。后端检查积分及库存、扣减积分；成功后客户端刷新账户和兑换记录。

兑换记录字段：`id, userId, memberName, memberPhone, prizeId, prizeName, imageUrl, costPoints, status, statusText, createdAt`。

## 尚待后端提供

- 商品服务端分页：当前忽略 page/pageSize，没有分页响应契约；触底加载只是本地分批展示。
- 商品多图：当前只有 imageUrl；前端可兼容未来的 images 字符串数组，但现有接口未返回该字段。
- 修改密码：当前没有 POST /auth/password 路由，未接入虚构接口。
- 取货码：没有取货码生成、校验接口，订单详情展示真实预约号。

远程核对结果：PR #2（客户）、#4（商户）、#3（后端）均于 2026-11-02 合并；最新 master 为 `7ac2368`。本地客户分支已快进同步这些已合并提交。共享 API 路径与字段没有变化；本次在客户目录补齐统一 401 跳转并验证新 JSON 404。后端与商户目录的变化来自远程同步，本次新增编辑仍仅在 `mobile/customer/` 内；README 未改。
