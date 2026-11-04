# 前端交接文档 · 果子来了

> 更新：2026-10-21 · 后端负责人：lzmy18131（分支 `Backend`）
> 适用于：PC 版（`frontend/`）、客户端 APP（`mobile/customer/`）、商户端 APP（`mobile/merchant/`）

**一句话**：后端接口已实现并逐条实测通过（42 项断言），契约以 `mobile/shared/api.js` 顶部注释 + 本文第 4 节为准。前端按第 4 节对接、按第 8 节验收即可，不需要再问接口长什么样。

---

## 1. 分工边界

| 目录 | 谁负责 | 规则 |
|---|---|---|
| `shop/**`、`fruitmall/**` | 后端 | 前端不要改 |
| `mobile/shared/**` | 冻结共享层 | **两端只读**，不要复制一份改；要新增能力先提需求 |
| `frontend/**`（PC 版） | 前端 | 自由改 |
| `mobile/customer/**` | 前端 | 自由改 |
| `mobile/merchant/**` | 前端 | 自由改 |
| `deploy/**`、`android/**` | 后端 / 打包同学 | 需要时协调 |

三个前端目录互不重叠，合并基本不会冲突。**接口只能新增、不能改名或改字段**，因为两端前端都依赖现有字段名。

---

## 2. 本地起服务（Windows / PowerShell）

环境要求：Python 3.10+（后端实测 Python 3.11.15 + Django 5.2.18），**不需要 Node**。

```powershell
cd FruitsAreHere
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

`0.0.0.0:8000` 而不是 `127.0.0.1:8000`：手机联调要走局域网 IP，绑 `127.0.0.1` 时手机访问不到。

浏览器打开 <http://127.0.0.1:8000/>。

**演示账号（`seed` 生成）**

| 角色 | 手机号 | 密码 | 初始状态 |
|---|---|---|---|
| 商户（店长） | `13800000000` | `admin123` | 超级用户，可进 `/admin/` |
| 会员（小果） | `13900000001` | `123456` | 余额 200 元、积分 120、有历史订单 |

`seed` 附带 8 个商品、5 个积分奖品、3 条公告。重复执行是幂等的（已存在则跳过）；`manage.py seed --reset` 会清空商品/奖品/公告后重建。

---

## 3. 三端入口

| 端 | URL | 技术 | 打包 |
|---|---|---|---|
| PC 版 | `/` | Vue 3 全局构建 + Bootstrap 5，hash 路由 | 无 |
| 客户端 APP | `/m/customer/` | 同上，移动端单页 | 可打 APK |
| 商户端 APP | `/m/merchant/` | 同上 | 可打 APK |

静态资源：`/static/` 对应 `frontend/static/**` 与 `mobile/**`（Vue、Bootstrap 已本地化在 `frontend/static/vendor/`，**不要引 CDN**）。

> 刷新任意子路径都会回落到对应入口页（hash 路由），只有 `/api/**` 例外——见第 5 节。

---

## 4. 接口总表（31 个）

前缀统一 `/api`。鉴权列：**公开** = 无需令牌；**登录** = 带令牌；**商户** = 令牌 + 商户角色。

### 4.1 账户（5 个）

| 方法 | 路径 | 鉴权 | 入参 | 返回 |
|---|---|---|---|---|
| POST | `/auth/register` | 公开 | `phone, password, nickname?` | `{token, user}` |
| POST | `/auth/login` | 公开 | `phone, password` | `{token, user}` |
| POST | `/auth/logout` | 登录 | — | `{ok:true}` |
| GET | `/auth/me` | 登录 | — | `{user, balanceLogs[], pointsLogs[]}`（各 20 条） |
| POST | `/auth/profile` | 登录 | `nickname` | `{user}` |

`user` 字段：`id, phone, nickname, role, isMerchant, balanceCents, points, createdAt, lastLogin`。

### 4.2 商品（6 个）

| 方法 | 路径 | 鉴权 | 入参 | 返回 |
|---|---|---|---|---|
| GET | `/products` | 公开 | `?keyword=&category=&scope=all` | `{products[], categories[]}` |
| GET | `/products/<id>` | 公开 | — | `{product}` |
| POST | `/products/<id>/status` | 商户 | `{status:'on'\|'off'}` | `{product}` |
| POST | `/merchant/products` | 商户 | `name, category, priceCents, originPriceCents, unit, stock, description, imageUrl, status` | `{product}` |
| PUT/PATCH | `/merchant/products/<id>` | 商户 | 任意子集 | `{product}` |
| DELETE | `/merchant/products/<id>/delete` | 商户 | — | `{ok:true}` |

- **公开** `GET /products` 只返回上架商品；商户端传 `scope=all`（带商户令牌）才含下架。
- `product` 字段：`id, name, category, priceCents, originPriceCents, unit, stock, sales, description, imageUrl, status, createdAt, updatedAt`。

### 4.3 预约订单（4 个）

| 方法 | 路径 | 鉴权 | 入参 | 返回 |
|---|---|---|---|---|
| GET | `/orders` | 登录 | `?status=pending\|confirmed\|completed\|cancelled\|all[&keyword=][&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD]` | `{orders[]}` |
| POST | `/orders` | 登录 | `productId, quantity, pickupTime, payMethod('balance'\|'onsite'), note?` | `{order}` |
| GET | `/orders/<id>` | 登录 | — | `{order}` |
| POST | `/orders/<id>/cancel` | 登录 | — | `{order}` |
| POST | `/merchant/orders/<id>/status` | 商户 | `{status:'confirmed'\|'completed'\|'cancelled'}` | `{order}` |

会员只能看到/操作自己的订单（越权返回 403）；商户看全部。

### 4.4 积分与奖品（6 个）

| 方法 | 路径 | 鉴权 | 入参 | 返回 |
|---|---|---|---|---|
| GET | `/prizes` | 公开 | `?scope=all`（商户含下架） | `{prizes[]}` |
| GET | `/redemptions` | 登录 | `?status=` | `{redemptions[]}` |
| POST | `/redemptions` | 登录 | `{prizeId}` | `{redemption, prize}`；`redemption.memberPoints` 是扣完后的积分 |
| POST | `/redemptions/<id>/status` | 商户 | `{status:'done'\|'cancelled'}` | `{redemption}` |
| POST | `/merchant/prizes` | 商户 | `name, costPoints, stock, description, imageUrl, status` | `{prize}` |
| PUT/PATCH | `/merchant/prizes/<id>` | 商户 | 任意子集 | `{prize}` |
| DELETE | `/merchant/prizes/<id>/delete` | 商户 | — | `{ok:true}` |

> 注意路径不一致：兑换发放是 `/redemptions/<id>/status`，**没有** `merchant/` 前缀（历史上就这样，契约文件里也是这么写的）。商品上下架同理是 `/products/<id>/status`。别按「商户接口都在 /merchant/ 下」推断。

### 4.5 会员管理（3 个 · 全部商户）

| 方法 | 路径 | 入参 | 返回 |
|---|---|---|---|
| GET | `/merchant/members` | `?keyword=` | `{members[]}`，每项额外含 `orderCount`、`totalSpentCents` |
| GET | `/merchant/members/<id>` | — | `{member, balanceLogs[], pointsLogs[], orders[]}` |
| POST | `/merchant/members/<id>/balance` | `{changeCents, reason?}` | `{member}` |

`changeCents` 正数=充值、负数=扣减；扣成负数会被拒（400）。

### 4.6 公告（4 个）

| 方法 | 路径 | 鉴权 | 入参 |
|---|---|---|---|
| GET | `/announcements` | 公开 | 返回最新 50 条 |
| POST | `/merchant/announcements` | 商户 | `{title, content}` |
| PUT/PATCH | `/merchant/announcements/<id>` | 商户 | 任意子集 |
| DELETE | `/merchant/announcements/<id>/delete` | 商户 | — |

客户端首页只展示最新 3 条（前端截取前 3 条即可，接口返回 50 条）。

### 4.7 概览、上传与健康检查

| 方法 | 路径 | 鉴权 | 入参 | 返回 |
|---|---|---|---|---|
| GET | `/merchant/stats` | 商户 | `?days=7`（1..90，默认 7） | `{stats:{...}}` |
| GET | `/health` | 公开 | — | `{ok:true, service, time}` |
| POST | `/merchant/upload` | 商户 | multipart，字段 `file`，jpg/png/webp/gif，≤5MB | `{url, size, contentType}` |

`stats` 字段：`memberCount, productOnCount, productOffCount, orderCount, pendingCount, confirmedCount, completedCount, salesCents, balanceCents, pointsIssued, redemptionCount, topProducts[{id,name,sales,stock}], revenueTrend[{date,salesCents,orderCount}], trendDays`。

`revenueTrend` 是**连续日期序列**（缺失日期补 0，从早到晚），长度等于 `days`，最后一项是今天——直接拿去画折线，不用自己补日期。

**上传接口**：`multipart/form-data`，字段名 `file`（也接受 `image`）。只认文件头，伪装成图片的脚本会被 400 拒掉；文件名由服务端生成，返回的 `url` 形如 `/media/uploads/20261104_641ce70d5b48.png`，直接写进商品的 `imageUrl` 即可。生产环境由 nginx 托管 `/media/`。

---

## 5. 通用约定（踩坑前先读）

**响应包**

```json
{"ok": true,  "product": {...}}          // 成功，业务数据平铺在顶层
{"ok": false, "error": "中文提示"}        // 失败，error 可直接弹给用户
```

**状态码**：`400` 参数/业务校验失败 · `401` 未登录或令牌失效 · `403` 已登录但无权限（非商户、看别人订单）· `404` 资源不存在 · `405` 请求方法不对。前端统一按 `ok` 字段判断成败，按状态码决定是否跳登录。

**数据类型**

- 金额一律是**分**的整数（`priceCents`、`totalCents`、`balanceCents`），展示前 `/100` 保留两位。`mobile/shared/api.js` 已提供 `fmtMoney()`。
- 时间一律是字符串 `YYYY-MM-DD HH:MM:SS`（不是 ISO、没有时区后缀）。
- `id` 都是整数。

**令牌**

- 请求头 `Authorization: Bearer <token>`。
- 兼容 `?token=` 查询参数（仅调试用，别在正式页面用——会进日志和 Referer）。

**未知路径**（本轮修复）：`/api/nope` 现在返回 `404 {"ok":false,"error":"接口不存在"}`。以前会被单页应用兜底路由吃掉，返回 `200 + HTML`，前端 `JSON.parse` 失败后只会显示「网络错误」，极难排查。

**跨域**：开发期回显任意 `Origin` 并放行；生产用 `DJANGO_CORS_ORIGINS` 白名单收紧。

---

## 6. 业务规则（决定前端交互怎么写）

**订单状态机**

```
pending（待确认） ──确认──> confirmed（已确认） ──完成──> completed（已完成，终态）
      │                          │
      └──────取消───────────────┴──> cancelled（已取消，终态）
```

- `completed` / `cancelled` 是终态，再改返回 400（文案如「订单已完成，不能再变更」）。
- 会员只能取消自己的待确认/已确认订单；商户可以确认、完成、取消。

**库存与销量**

- 下单**立即**扣库存、加销量（不是支付时）。
- 取消订单会回滚库存与销量。
- 下单校验：商品必须上架、库存足够、数量 1–99。库存不足返回 `库存不足，当前仅剩 N 盒`。

**支付**

- `payMethod`：`balance`（余额支付）/ `onsite`（到店支付）。
- 余额支付在下单时立即扣款并写流水；余额不足返回 400，提示改用「到店支付」。
- 取消时，余额支付的订单自动原路退款并写流水。

**积分**

- 订单**完成**时发放：`total_cents // 100 × 1`，即 1 元 = 1 积分，向下取整。
- 取消/未完成不发积分。
- 兑换奖品：立即扣积分、扣奖品库存；商户「发放」后变 `done`；商户「取消」会退还积分并把库存加回来。

**会员余额调整**

- 商户手动调整不能把余额调成负数（400）。
- 每次变动都写 `balance_logs`，前端「余额流水」直接展示。

---

## 7. 前端待办

### P0 · 必须做（后端已就绪，纯前端工作）

1. **三端页面按 README 功能清单落地**：商品列表/详情、登录注册、预约下单、我的预约（取消）、积分兑换与记录、我的账户（余额/积分/流水/改昵称）；商户端商品管理、预约单处理、会员与余额、公告、奖品、经营概览。
2. **401 统一处理**：任何接口返回 401 → 清本地 token → 跳登录页并保留来路。
3. **金额格式化**：分 → 元、两位小数；下单页展示单价 × 数量 = 总额，与后端 `totalCents` 一致。
4. **写操作防重复提交**：下单、兑换、余额调整都要按钮 loading/禁用，避免连点造成重复订单。
5. **空态与错误态**：列表为空给引导文案；接口失败直接展示 `error` 字段，不要吞掉。

### P1 · 需要后端先加接口（现在做不了，别硬编码绕过）

| 需求 | 现状 | 处理方式 |
|---|---|---|
| 商品/订单/会员列表分页 | 接口全量返回；`/orders`、`/redemptions` 硬上限 300 条 | 数据量小先不分页；要分页需后端加 `page/pageSize` 并改统一响应 |
| 登录态自动续期 | 令牌**无过期时间**，只有 logout 才失效 | 前端按「长期有效」处理；需要过期/续期要先改后端 |

> 2026-11-04 已落地：**图片上传**（`POST /merchant/upload`）、**营收趋势**（`/merchant/stats?days=N` 的 `revenueTrend`）、**订单日期筛选**（`/orders?dateFrom=&dateTo=`）。这三项现在可以直接做，不用再提需求。

### P2 · 体验优化

骨架屏、图片懒加载与失败占位、下拉刷新、表单校验即时提示（手机号 `^1[3-9]\d{9}$`、密码 ≥6 位，与后端一致）。

---

## 8. 验收清单

以下步骤后端已逐条实测（**62 项断言全过**，2026-11-04），前端做完后按同样路径自查。

### 客户端 APP

| # | 操作 | 预期 |
|---|---|---|
| 1 | 用 `13900000001 / 123456` 登录 | 进入首页，显示 3 条公告、上架商品 |
| 2 | 选任一商品下 2 件、选「余额支付」 | 下单成功；「我的账户」余额减少 `2 × 单价`；商品库存减少 2 |
| 3 | 同一商品下 99 件 | 报错「库存不足，当前仅剩 N …」，订单不创建 |
| 4 | 「我的预约」里取消刚下的单 | 状态变已取消；余额原路退回；库存加回 |
| 5 | 让商户把订单改成「已完成」后刷新 | 状态已完成；积分增加「订单金额(元)」点 |
| 6 | 用积分兑换最便宜的奖品 | 提示成功；积分减少对应点数；兑换记录为「待发放」 |
| 7 | 用别人的订单号访问 `/api/orders/<id>` | 403，页面提示无权限 |

### 商户端 APP

| # | 操作 | 预期 |
|---|---|---|
| 1 | 用 `13800000000 / admin123` 登录 | 概览页显示会员数、订单数、待确认数、营收 |
| 2 | 新增商品（名称/价格/库存/分类） | 列表出现；客户端立即可见（上架状态） |
| 3 | 下架该商品 | 客户端商品列表里消失；再下单提示「该商品已下架」 |
| 4 | 待确认订单 → 确认 → 完成 | 两次都成功；完成后会员积分到账 |
| 5 | 取消一个余额支付的订单 | 订单取消；会员余额退回 |
| 6 | 会员管理 → 给会员充值 50 元 | 余额 +5000 分；流水出现「商户调整余额」 |
| 7 | 给会员扣 9999 元 | 400，提示不能为负数 |
| 8 | 发布公告 | 客户端首页最新 3 条里出现 |
| 9 | 新增商品时点「上传图片」选一张 jpg/png | 返回 `/media/uploads/...`，商品卡片能显示该图 |
| 10 | 上传一个改名为 `.png` 的文本文件 | 400，提示只支持 jpg/png/webp/gif |
| 11 | 概览页看营收趋势 | 折线有 7 个点（可切 30 天），无订单的日期显示 0 |
| 12 | 订单列表按日期筛选（今天 / 未来某天） | 今天有数据；未来日期为空；非法日期提示格式错误 |

### PC 版

与客户端同一套接口，验收核心链路：登录 → 商品 → 下单 → 我的订单 → 积分兑换 → 个人中心；商户侧：商品/订单/会员/公告/概览。

---

## 9. 联调方式

**手机连同一 WiFi 调试**

1. 后端用 `runserver 0.0.0.0:8000` 启动（绑 `0.0.0.0`，否则手机连不上）。
2. 查本机 IP：`ipconfig` 找 IPv4 地址，例如 `192.168.1.10`。
3. 手机打开 `http://192.168.1.10:8000/m/customer/?api=http://192.168.1.10:8000/api`。
   - `?api=` 会**被记住**，下次不用再带；优先级：`?api=` > 上次记住的 > 编译期注入 > 同源 `/api`。
4. 手机打不开时先查：防火墙是否放行 8000、手机和电脑是否同一网段。

**跨域**：浏览器直接访问 `${你的源}/api` 时，开发期中间件回显 Origin 并放行；生产环境要设置 `DJANGO_CORS_ORIGINS` 白名单，否则会被拒。

**改完前端不生效**：先 `Ctrl+F5` 强刷（生产 nginx 用协商缓存，不会缓存 7 天）。

---

## 10. 协作规则

1. **不要改 `mobile/shared/**`**：两端共用 API 客户端与设计令牌，改一处会同时影响两个 APP。要加能力先提需求。
2. **接口只加不改**：新增接口后同步更新 `mobile/shared/api.js` 顶部契约注释（那是单一事实来源）。
3. **分支**：`git switch -c feat/<你的名字或模块>` → 提交 → 推送 → 提 PR 合进 `master`。不要直接往 `master` 推。
4. **改完先自己按第 8 节跑一遍**，再叫人 review。

---

## 11. 本轮后端改动（2026-10-21，分支 `Backend`）

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | `manage.py seed` 在 Windows 控制台崩溃，库只写了一半（2 个用户，0 商品） | 输出里 `¥`(U+00A5) 无法用 GBK 编码，`UnicodeEncodeError`；崩在创建会员之后、写商品之前 | `¥200` → `200 元`；实测重复执行 exit=0 且数据完整（8 商品 / 5 奖品 / 3 公告） |
| 2 | 未知 API 路径返回 `200 + HTML` | `/api/` 未命中后落到单页应用兜底路由 `^.*$` | 在兜底前加 `^api/.*$` → JSON 404；实测 `/api/nope` → `404 {"ok":false,...}` |
| 3 | 错误文案「订单已已完成」「该兑换记录已已发放」 | `status_text` 本身带「已」，外层又拼了一个 | 去掉外层「已」（3 处）；实测文案为「订单已完成，不能再变更」 |

后端实测：42 项 E2E 断言全通过（登录/鉴权/越权/下单/余额扣减/库存扣减与回滚/积分发放/兑换/公告/概览/下架拦截/404 契约）。

---

## 12. 新增能力（2026-11-04，分支 `Backend`）

| 能力 | 接口 | 说明 |
|---|---|---|
| 图片上传 | `POST /merchant/upload` | multipart，字段 `file`；按文件头校验类型；≤5MB；文件名服务端生成；返回 `{url, size, contentType}` |
| 营收趋势 | `GET /merchant/stats?days=N` | 返回 `stats.revenueTrend`，连续日期序列、缺日补 0，默认 7 天、最多 90 天 |
| 订单日期筛选 | `GET /orders?dateFrom=&dateTo=` | `YYYY-MM-DD`，格式错或起止颠倒返回 400 |

配套改动：`MEDIA_URL=/media/`、`MEDIA_ROOT=media/`（已在 `.gitignore`）、开发期由 Django 托管、生产由 nginx 的 `/media/` location 托管（`deploy/nginx.conf` 与 `bootstrap.sh` 已同步建目录）。

后端实测：**62/62** 断言通过（新增 20 项覆盖上传鉴权/伪装文件拒绝/回读图片、日期筛选与非法参数、趋势长度与字段）。

