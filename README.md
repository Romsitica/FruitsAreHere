# 果子来了 · 水果店铺商品展示与预约订购会员平台

一个面向水果门店的「商品展示 + 预约订购 + 会员积分」平台。门店用商户端管理商品、订单、会员余额和公告；顾客用会员端浏览鲜果、手机号登录、在线预约到店自提，订单完成后累计积分兑换奖品。

三端形态：

| 端 | 形态 | 入口 |
|---|---|---|
| 商户端 | 移动端 H5（可打包 APK） | `/m/merchant/` |
| 客户端 | 移动端 H5（可打包 APK） | `/m/customer/` |
| PC 版 | 桌面端 Vue 单页应用 | `/` |

## 功能

### 商户端

- **商品上架与下架**：新增/编辑商品（名称、分类、售价、划线价、规格、库存、详情、主图），一键上下架、删除
- **管理会员账户余额**：查看会员列表与累计消费，余额充值/扣减（不可扣成负数），余额与积分流水可追溯
- **管理预约下单**：按状态筛选预约单，确认 → 完成 → 取消；取消自动回滚库存并对余额支付订单退款，完成时自动发放积分
- **发布公告**：公告的增删改，最新 3 条展示在客户端首页
- **积分奖品与兑换发放**：维护奖品与库存，确认发放或取消退还积分
- **经营概览**：营收、订单数、会员数、在售商品、待确认预约、热销商品

### 客户端（会员端）

- **查看上架商品详情**：分类筛选、关键词搜索、商品详情（价格、库存、已售、规格、描述）
- **会员注册与登录**：手机号 + 密码，口令 PBKDF2 加盐散列，令牌登录态
- **预约订购水果**：选择数量、预约取货时间、支付方式（到店支付 / 余额支付）、备注；可在「我的预约」中自助取消
- **积分兑换奖品**：订单完成按 1 元 = 1 积分累计，积分兑换奖品并查看兑换记录
- **我的账户**：余额、积分、余额流水、积分流水、昵称修改

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.11 + Django 5.2（纯 Django 视图返回 JSON，未引入 DRF） |
| 数据库 | SQLite（Django ORM，切换 PostgreSQL 只需改 `DATABASES`） |
| 前端 | Vue 3（全局构建，无打包工具）+ Bootstrap 5 + 原生 CSS |
| 鉴权 | 自建令牌表 + `Authorization: Bearer <token>` |
| 部署 | nginx + gunicorn + systemd（阿里云轻量应用服务器、Alibaba Cloud Linux 3） |
| APK | Android WebView 壳 + Gradle 双 flavor（也可用 SDK 工具链零 Gradle 打包） |

> 前端刻意不引入 Node/打包工具：Vue 与 Bootstrap 已本地化到 `frontend/static/vendor/`，改完代码刷新即生效，适合教学与小团队协作。

## 目录结构

```
.
├── manage.py                 Django 命令入口
├── requirements.txt          开发依赖（仅 Django）
├── fruitmall/                工程配置层
│   ├── settings.py           环境变量化配置 + SQLite 版本兜底
│   ├── urls.py               admin / api / 两个移动端入口 / SPA 兜底
│   ├── middleware.py         CORS 中间件（支持白名单）
│   └── __init__.py           SQLite < 3.31 时自动替换为 pysqlite3
├── shop/                     业务应用层
│   ├── models.py             9 张业务表
│   ├── api.py                30 个接口 + 事务处理
│   ├── auth.py               令牌鉴权装饰器 + 参数校验
│   ├── api_urls.py           接口路由表
│   └── management/commands/seed.py   演示数据
├── frontend/                 PC 版（Vue 单页应用）
│   ├── index.html
│   └── static/{css,js,vendor}
├── mobile/                   移动端工作区
│   ├── shared/               冻结共享层：API 客户端 + 设计令牌（两个 APP 共用）
│   ├── customer/             客户端 APP
│   └── merchant/             商户端 APP
├── android/                  APK 打包
│   ├── build_apk.py          零 Gradle 打包脚本（只用 SDK 工具链）
│   ├── export_web.py         把 H5 导出到 APK 的 assets
│   └── app/                  WebView 壳工程（Gradle 双 flavor）
└── deploy/                   服务器部署
    ├── bootstrap.sh          服务器一键部署
    ├── deploy_to_server.py   本机一键上传并部署
    ├── gunicorn.service / nginx.conf / requirements-prod.txt
```

## 快速开始（本地）

环境要求：**Python 3.10+**（Django 5.2 的硬性要求），无需 Node。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed          # 写入演示数据
.\.venv\Scripts\python.exe manage.py runserver 8000
```

打开 http://127.0.0.1:8000/ 。手机需连同一 WiFi，可用 `http://<电脑IP>:8000/m/customer/`，并加 `?api=http://<电脑IP>:8000/api` 指定后端。

### 演示账号

| 角色 | 手机号 | 密码 |
|---|---|---|
| 商户 | `13800000000` | `admin123` |
| 会员 | `13900000001` | `123456` |

Django 管理后台：`/admin/`（用商户账号登录）。

## API 概览

接口契约的**单一事实来源**是 [`mobile/shared/api.js`](mobile/shared/api.js) 顶部的注释块，包含全部路径、入参、返回结构。约定：

- 所有接口前缀 `/api`
- 金额字段一律是「分」的整数（如 `priceCents`）
- 时间字段是 `YYYY-MM-DD HH:MM:SS` 字符串
- 需登录的接口带 `Authorization: Bearer <token>`
- 商户专属接口在 `/api/merchant/` 下
- 统一响应：成功 `{"ok": true, ...}`，失败 `{"ok": false, "error": "中文提示"}`

## 打包成 APK

工程自带一套**不依赖 Gradle** 的打包脚本（只用 Android SDK 的 aapt2/d8/zipalign/apksigner + JDK）：

```powershell
# 1. 在 android/gradle.properties 里配置后端地址（customerApiBase / merchantApiBase）
# 2. 打包
.\.venv\Scripts\python.exe android\build_apk.py
```

产物：`android/dist/customer/app-customer-debug.apk`、`android/dist/merchant/app-merchant-debug.apk`。

脚本会自动导出 H5 到 assets、编译资源、生成 dex、对齐并签名（首次自动生成调试证书）。也支持用 Android Studio 打开 `android/` 目录走标准 Gradle 流程。

> 注意：APK 里的 H5 是编译期快照，前端改完必须重新执行打包脚本。

## 部署到服务器

部署脚本依赖 `paramiko`（本机执行，不需要装在服务器上）：

```powershell
.\.venv\Scripts\python.exe -m pip install paramiko
```

```powershell
$env:FRUITS_SSH_PASSWORD="服务器 root 密码"
.\.venv\Scripts\python.exe deploy\deploy_to_server.py          # 全量部署
.\.venv\Scripts\python.exe deploy\deploy_to_server.py --check  # 只看状态
```

脚本会打包代码 → SFTP 上传 → 远程执行 `deploy/bootstrap.sh`（装依赖 → 建 venv → 生成随机 `SECRET_KEY` → 建库灌数据 → `collectstatic` → 写 systemd → 写 nginx → 自检）。

服务器侧架构：`nginx:80` → `gunicorn:127.0.0.1:8001` → SQLite；静态文件由 nginx 直接托管。环境变量集中在服务器的 `/opt/fruits/deploy/.env`（不入库）。

### 部署踩坑记录

在 Alibaba Cloud Linux 3 / CentOS 8 系上部署 Django 5 会连踩三个坑，均已在代码里处理：

1. **系统 Python 3.6 < Django 要求的 3.10** → `bootstrap.sh` 自动检测并安装 `python3.11`
2. **SQLite 3.26 < Django 要求的 3.31**（`NotSupportedError`）→ 生产依赖装 `pysqlite3-binary`，由 `fruitmall/__init__.py` 在运行时替换 `sqlite3` 模块
3. **`data/` 目录不存在导致 `unable to open database file`** → `settings.py` 里 `DATA_DIR.mkdir(exist_ok=True)` 兜底

另外一次线上事故：静态资源一开始设了 `expires 7d`，而文件名不带版本号，导致改版后浏览器最长 7 天仍用旧文件。现已改为协商缓存（`Cache-Control: no-cache` + ETag，命中返回 304），仅 `static/vendor/` 保留长缓存。

## 团队分工

| 角色 | 负责目录 | 说明 |
|---|---|---|
| 商户端前端 | `mobile/merchant/**` | 移动端商户 APP |
| 客户端前端 | `mobile/customer/**` | 移动端客户 APP |
| 后端 | `shop/**`、`fruitmall/**` | 接口、模型、部署 |

协作约定：

1. `mobile/shared/**` 是**冻结共享层**，两端只读共用，不要各自复制一份修改
2. 接口只能新增不能改名（前端两端都依赖现有字段），新增后同步到 `mobile/shared/api.js` 的契约注释
3. 三个目录互不重叠，可并行开发、合并基本无冲突

## 已知限制与后续计划

- 数据库为 SQLite，适合演示与小规模使用；高并发需换 PostgreSQL
- 目前为 HTTP 明文，生产建议上 HTTPS 并收紧 `DJANGO_CORS_ORIGINS` 白名单
- 商品图片为外部图片地址，商户端「拍照上传」需要后端补 `POST /merchant/upload`
- 列表接口暂未分页，数据量大后需补 `page/pageSize`
