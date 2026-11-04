# 商户端交接文档（商户版 `/m/merchant/`）

> 更新：2026-11-04 · 后端分支 `Backend`（`3af232e`）
> 你负责：`mobile/merchant/**`
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

打开 <http://127.0.0.1:8000/m/merchant/>。

| 账号 | 密码 |
|---|---|
| 商户店长 `13800000000` | `admin123` |
| 演示会员 `13900000001` | `123456`（用来造订单/余额） |

另可用 `/admin/` 进 Django 后台看原始数据。

---

## 2. 你用的接口

前缀 `/api`，全部需要商户令牌（`Authorization: Bearer <token>`），除商品/公告/奖品的只读接口。

### 商品

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/products?scope=all` | 含下架商品 |
| POST | `/merchant/products` | 新建，**支持 `images` 数组** |
| PUT/PATCH | `/merchant/products/<id>` | 局部更新（传 `images` 会整体替换图集） |
| POST | `/products/<id>/status` | `{status:'on'\|'off'}` 上下架 |
| DELETE | `/merchant/products/<id>/delete` | 删除 |
| POST | `/merchant/upload` | **图片上传**，multipart 字段 `file` |

### 订单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/orders?status=&keyword=&dateFrom=&dateTo=` | 查全部订单，**已支持日期筛选** |
| GET | `/orders/<id>` | 详情 |
| POST | `/merchant/orders/<id>/status` | `{status:'confirmed'\|'completed'\|'cancelled'}` |

### 会员 / 积分 / 公告 / 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/merchant/members?keyword=` | 会员列表（含 `orderCount`、`totalSpentCents`） |
| GET | `/merchant/members/<id>` | 会员详情 + 余额/积分流水 + 最近订单 |
| POST | `/merchant/members/<id>/balance` | `{changeCents, reason}`，正充负扣 |
| GET | `/prizes?scope=all` | 含下架奖品 |
| POST/PUT/DELETE | `/merchant/prizes...` | 奖品增改删 |
| GET | `/redemptions?status=` | 兑换记录 |
| POST | `/redemptions/<id>/status` | `{status:'done'\|'cancelled'}`，取消会退积分回库存 |
| GET | `/announcements` | 公告（客户端读同一接口） |
| POST/PUT/DELETE | `/merchant/announcements...` | 公告增改删 |
| GET | `/merchant/stats?days=7` | 概览，**含营收趋势** |

---

## 3. 三件事后端已经就绪（你代码里正卡着它们）

`mobile/merchant/app.js` 末尾的 TODO 写着「以下三条都卡在后端接口」，现在都解除了：

### ① 图片上传 —— 直接可用

后端已上线 `POST /merchant/upload`：

- multipart，字段名 **`file`**（你现有 `uploadImage()` 用的就是 `file`，不用改）
- jpg / png / webp / gif，≤5MB，按文件头判定（改后缀的假图片会被 400 拒掉）
- 返回 `{ok:true, url:'/media/uploads/xxx.png', size, contentType}`

**你要做的只是**：把「图片上传功能还没上线」那条兜底文案删掉，失败时直接展示后端 `error`。

### ② 营收趋势 —— 路径和你 TODO 里写的不一样

你 TODO 写的是「需后端补 `/merchant/stats/trend`」，**没有这个接口**。实际是：

```
GET /api/merchant/stats?days=7        # 1..90，默认 7
→ stats.revenueTrend = [{ date:'2026-11-04', salesCents: 54000, orderCount: 3 }, ...]
```

`revenueTrend` 是**连续日期序列**，缺失日期补 0，最后一项是今天，直接画折线即可，不用自己补日期。

### ③ 订单日期筛选 —— 直接可用

```
GET /api/orders?dateFrom=2026-11-01&dateTo=2026-11-04
```

日期格式 `YYYY-MM-DD`；格式错、或 `dateFrom > dateTo` 返回 400。可以和 `status`、`keyword` 组合。

---

## 4. 新能力：商品多图（需要前端配合）

后端已支持一个 `images` 数组（最多 6 张），`imageUrl` 仍是封面：

```json
POST /api/merchant/products
{
  "name": "丹东草莓",
  "priceCents": 3990,
  "stock": 20,
  "images": ["/media/uploads/a.png", "/media/uploads/b.png"]
}
```

规则：

- 只传 `images` 不传 `imageUrl` → 封面自动取 `images[0]`；
- 同时传 `imageUrl` → 以它为准；
- 最多 6 张，单条地址 ≤512 字符，非数组/非字符串/超张数都返回 400；
- **上传接口不变**，一次一张。前端要「选多张 → 循环上传 → 拿到 N 个 url → 一次性保存商品」。
  不要每传一张就保存一次，那样后一次会把前一次覆盖掉——这就是你看到的「覆盖」现象。

**你改的地方**：`McProducts` 的表单现在只有单个 `imageUrl` + `previewUrl`，需要改成数组（缩略图列表 + 单张删除 + 首图标记）。

> 拉代码后先执行 `python manage.py migrate`，否则商品接口会因缺 `images` 列报错。

---

## 5. 业务规则（决定交互怎么写）

**订单状态机**

```
pending（待确认）──确认──> confirmed（已确认）──完成──> completed（已完成，终态）
      │                        │
      └────────取消────────────┴──> cancelled（已取消，终态）
```

- `completed` / `cancelled` 是终态，再改返回 400。
- **完成时自动发积分**：`订单金额(元) × 1`，向下取整。
- **取消时**：库存与销量回滚；余额支付的订单自动原路退款并写流水。
- 批量处理：后端只有单条接口，前端循环调用、汇总失败项（你已实现，保持）。

**商品**

- 下单立即扣库存，取消回滚。
- 删除商品会把历史订单的 `productId` 置空（订单里保留 `productName` 快照），**有销售记录的商品建议下架而不是删除**。

**会员余额**

- `changeCents` 正数充值、负数扣减；扣成负数返回 400。
- 每次都写流水，会员详情页可查。

**奖品/兑换**

- 兑换时扣积分与奖品库存；商户「发放」→ `done`；「取消」→ 退还积分并把库存加回去。

---

## 6. 验收清单

| # | 操作 | 预期 |
|---|---|---|
| 1 | 登录 `13800000000 / admin123` | 概览显示会员数、订单数、待确认数、营收 |
| 2 | 新增商品，上传一张 jpg | 返回 `/media/uploads/...`，列表卡片显示该图 |
| 3 | 上传一个改名成 `.png` 的文本文件 | 400，提示只支持 jpg/png/webp/gif |
| 4 | 一次选 3 张图保存商品 | 保存后 `images` 有 3 条，封面是第 1 张（不再互相覆盖） |
| 5 | 下架该商品 | 客户端列表消失；再下单提示「该商品已下架」 |
| 6 | 待确认订单 → 确认 → 完成 | 状态流转正确；会员积分到账 |
| 7 | 取消一笔余额支付订单 | 订单取消；会员余额退回；库存回滚 |
| 8 | 概览页画趋势图（`days=7` / `days=30`） | 7 或 30 个点，无订单的日期为 0 |
| 9 | 订单列表按日期筛选（今天 / 未来某天） | 今天有数据；未来为空 |
| 10 | 会员管理充值 50 元 / 扣 9999 元 | 前者成功且流水出现；后者 400 |
| 11 | 发布公告 | 客户端首页最新 3 条出现 |

---

## 7. 联调

1. 后端 `runserver 0.0.0.0:8000`（必须 0.0.0.0）；
2. 手机开 `http://<电脑IP>:8000/m/merchant/?api=http://<电脑IP>:8000/api`；
3. 上传走的是相对 `/api` 的地址，`?api=` 也会作用到上传（你 `uploadImage()` 用 `api.config.baseUrl`）。

**上传大小**：默认上限 5MB。生产 nginx 已配 `client_max_body_size 20m`。

---

## 8. 协作

1. 不要改 `mobile/shared/**`。
2. 接口只加不改，字段以 `mobile/shared/api.js` 顶部注释为准。
3. 分支 `feat/<模块>` → PR 到 `master`。
4. 提交前按第 6 节自查。

---

## 9. 近期后端变化（会影响你）

| 日期 | 变化 |
|---|---|
| 10-21 | 未知 `/api/*` 返回 JSON 404（以前 200 + HTML，误判「网络错误」） |
| 11-04 | 图片上传接口上线（`POST /merchant/upload`） |
| 11-04 | `stats?days=N` 返回 `revenueTrend` |
| 11-04 | `/orders` 支持 `dateFrom/dateTo` |
| 11-04 | 商品支持 `images` 数组，最多 6 张 |
| 11-04 | 整数参数拒绝小数/布尔（`1.5` → 400），价格/库存别传浮点 |
| 11-04 | 401 只清发起请求时的登录态，换号不再被误踢 |
