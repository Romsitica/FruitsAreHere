"""果子来了 · 后端接口回归脚本（仅用标准库）。

用法（仓库根目录，另一个窗口先跑 manage.py runserver 8000）：

    .\.venv\Scripts\python.exe tests/backend-e2e.py

每行一个 PASS/FAIL，全部通过退出码为 0。脚本会自建商品/订单并在结束时清理，
可以重复执行；会员余额与积分由脚本自己准备，不依赖种子数据的初始值。
"""
import base64
import json
import random
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = "http://127.0.0.1:8000/api"
NEW_PHONE = "137" + "".join(random.choice("0123456789") for _ in range(8))
results = []


def call(method, path, payload=None, token=None, expect=200):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode())


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS  " if cond else "FAIL  ") + name + (("  <- " + detail) if detail else ""))


def call_multipart(path, field, filename, content, content_type, token=None):
    """multipart/form-data 上传，返回 (status, json)。"""
    boundary = "----e2eboundary7a1"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + path, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode())


def call_raw(url, token=None):
    """取原始响应字节，用于校验上传后的图片能访问。"""
    req = urllib.request.Request(url, method="GET")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


# 1. 健康检查
st, r = call("GET", "/health")
check("health 200 & ok", st == 200 and r.get("ok") is True, f"{st} {r}")

st, r = call("GET", "/nope")
check("unknown api path -> 404 JSON", st == 404 and r.get("ok") is False, f"{st} {r}")

# 2. 登录
st, r = call("POST", "/auth/login", {"phone": "13800000000", "password": "admin123"})
mt = r.get("token")
check("merchant login", st == 200 and bool(mt), f"{st} {r.get('error', '')}")

st, r = call("POST", "/auth/login", {"phone": "13900000001", "password": "123456"})
ut = r.get("token")
check("member login", st == 200 and bool(ut), f"{st} {r.get('error', '')}")
check("login role flags", r.get("user", {}).get("isMerchant") is False)

st, r = call("POST", "/auth/login", {"phone": "13900000001", "password": "wrong!"})
check("wrong password -> 401", st == 401 and r.get("ok") is False, str(st))

# 2.5 前置：余额不够就先充，保证重复执行不会因为余额耗尽而假失败
st, r = call("GET", "/merchant/members?keyword=13900000001", token=mt)
seed_member = (r.get("members") or [{}])[0]
if st == 200 and seed_member.get("balanceCents", 0) < 20000:
    topup = 20000 - seed_member["balanceCents"]
    st2, r2 = call("POST", f"/merchant/members/{seed_member['id']}/balance",
                   {"changeCents": topup, "reason": "E2E 补充测试余额"}, token=mt)
    check("top up member balance", st2 == 200, f"{st2} {r2.get('error', '')}")

# 3. 公开商品列表
st, r = call("GET", "/products")
check("public product list", st == 200 and len(r.get("products", [])) >= 8,
      f"{st} n={len(r.get('products', []))}")
check("categories returned", len(r.get("categories", [])) > 0, str(r.get("categories")))

# 4. 商户专属接口的权限
st, r = call("GET", "/merchant/members")
check("merchant api without token -> 401", st == 401, str(st))
st, r = call("GET", "/merchant/members", token=ut)
check("member token on merchant api -> 403", st == 403, str(st))
st, r = call("GET", "/merchant/members", token=mt)
check("merchant sees members", st == 200 and len(r.get("members", [])) >= 1, str(st))

# 5. 上架商品
st, r = call("POST", "/merchant/products",
             {"name": "E2E 测试果", "category": "时令鲜果", "priceCents": 1000,
              "originPriceCents": 1500, "unit": "盒", "stock": 10,
              "description": "e2e", "imageUrl": "http://example.com/x.png"}, token=mt)
pid = r.get("product", {}).get("id")
check("merchant create product", st == 200 and pid is not None, f"{st} {r}")

st, r = call("GET", f"/products/{pid}")
check("product detail", st == 200 and r.get("product", {}).get("priceCents") == 1000, str(st))

# 6. 余额支付下单
st, r = call("GET", "/auth/me", token=ut)
before_balance = r["user"]["balanceCents"]
before_points = r["user"]["points"]
check("me returns logs", st == 200 and "balanceLogs" in r, str(st))

st, r = call("POST", "/orders",
             {"productId": pid, "quantity": 2, "pickupTime": "2026-10-22 10:00",
              "payMethod": "balance", "note": "e2e"}, token=ut)
oid = r.get("order", {}).get("id")
check("create order (balance)", st == 200 and oid is not None, f"{st} {r.get('error', '')}")
check("order total = 2000", r.get("order", {}).get("totalCents") == 2000)
check("order starts pending", r.get("order", {}).get("status") == "pending")

st, r = call("GET", "/auth/me", token=ut)
check("balance deducted 2000", r["user"]["balanceCents"] == before_balance - 2000,
      f"{before_balance} -> {r['user']['balanceCents']}")

st, r = call("GET", f"/products/{pid}")
check("stock 10 -> 8", r.get("product", {}).get("stock") == 8, str(r.get("product", {}).get("stock")))

# 7. 另一会员不能看该订单
st, r = call("POST", "/auth/register", {"phone": NEW_PHONE, "password": "abc123"})
ut2 = r.get("token")
check("register new member", st == 200 and bool(ut2), f"{st} {r.get('error', '')}")
st, r = call("GET", f"/orders/{oid}", token=ut2)
check("other member cannot read order -> 403", st == 403, str(st))

# 8. 超库存下单被拒
st, r = call("POST", "/orders", {"productId": pid, "quantity": 99, "payMethod": "onsite"}, token=ut)
check("over-stock order -> 400", st == 400 and "库存不足" in r.get("error", ""), f"{st} {r.get('error', '')}")

# 8.5 B01 整数校验：小数/布尔不能被静默截断
st, r = call("GET", "/orders", token=mt)
orders_before = len(r.get("orders", []))
st, r = call("POST", "/orders", {"productId": pid, "quantity": 1.5, "payMethod": "onsite"}, token=ut)
check("decimal quantity -> 400", st == 400 and "整数" in r.get("error", ""), f"{st} {r.get('error', '')}")
st, r = call("POST", "/orders", {"productId": pid, "quantity": 1.0, "payMethod": "onsite"}, token=ut)
check("float with .0 quantity -> 400", st == 400, f"{st} {r.get('error', '')}")
st, r = call("POST", "/orders", {"productId": pid, "quantity": True, "payMethod": "onsite"}, token=ut)
check("boolean quantity -> 400", st == 400 and "整数" in r.get("error", ""), f"{st} {r.get('error', '')}")
st, r = call("GET", "/orders", token=mt)
check("rejected requests created no order", len(r.get("orders", [])) == orders_before,
      f"{orders_before} -> {len(r.get('orders', []))}")

st, r = call("POST", "/merchant/products", {"name": "E2E 小数价", "priceCents": 1.9}, token=mt)
check("decimal priceCents -> 400", st == 400 and "整数" in r.get("error", ""), f"{st} {r.get('error', '')}")
st, r = call("POST", "/merchant/products", {"name": "E2E 布尔库存", "priceCents": 100, "stock": True}, token=mt)
check("boolean stock -> 400", st == 400, f"{st} {r.get('error', '')}")

# 整数字符串仍允许（HTML 表单/查询串常见）；创建后立刻取消，避免影响后面的计数
st, r = call("POST", "/orders", {"productId": pid, "quantity": "2", "payMethod": "onsite"}, token=ut)
str_oid = r.get("order", {}).get("id")
check("integer string quantity accepted", st == 200 and r.get("order", {}).get("quantity") == 2,
      f"{st} {r.get('error', '')}")
if str_oid:
    call("POST", f"/orders/{str_oid}/cancel", token=ut)

# 9. 商户确认 -> 完成，发积分（2000 分 = 20 元 -> 20 积分）
st, r = call("POST", f"/merchant/orders/{oid}/status", {"status": "confirmed"}, token=mt)
check("confirm order", st == 200 and r.get("order", {}).get("status") == "confirmed", str(st))
st, r = call("POST", f"/merchant/orders/{oid}/status", {"status": "completed"}, token=mt)
check("complete order", st == 200 and r.get("order", {}).get("status") == "completed", str(st))
check("points gained = 20", r.get("order", {}).get("pointsGained") == 20,
      str(r.get("order", {}).get("pointsGained")))

st, r = call("GET", "/auth/me", token=ut)
check("member points +20", r["user"]["points"] == before_points + 20,
      f"{before_points} -> {r['user']['points']}")

st, r = call("POST", f"/merchant/orders/{oid}/status", {"status": "cancelled"}, token=mt)
check("cannot cancel completed -> 400", st == 400, f"{st} {r.get('error', '')}")

# 10. 积分兑换（先自己造一笔大额已完成订单，保证积分够用，不依赖种子库初始积分）
st, r = call("POST", "/merchant/products",
             {"name": "E2E 大额果", "priceCents": 50000, "stock": 2, "category": "时令鲜果"},
             token=mt)
big_pid = r.get("product", {}).get("id")
check("create high-value product", st == 200 and big_pid is not None, f"{st} {r.get('error', '')}")
st, r = call("POST", "/orders", {"productId": big_pid, "quantity": 1, "payMethod": "onsite"}, token=ut)
big_oid = r.get("order", {}).get("id")
check("create high-value order", st == 200, f"{st} {r.get('error', '')}")
st, r = call("POST", f"/merchant/orders/{big_oid}/status", {"status": "completed"}, token=mt)
check("complete high-value order", st == 200, str(st))
st, r = call("GET", "/auth/me", token=ut)
points_now = r["user"]["points"]
check("high-value order grants 500 points", points_now >= before_points + 500,
      f"{before_points} -> {points_now}")

st, r = call("GET", "/prizes")
prize = r.get("prizes", [{}])[0]
st, r = call("POST", "/redemptions", {"prizeId": prize["id"]}, token=ut)
check("redeem prize", st == 200 and r.get("redemption", {}).get("status") == "pending",
      f"{st} {r.get('error', '')}")
points_after_redeem = r.get("redemption", {}).get("memberPoints")
check("points deducted by cost", points_after_redeem == points_now - prize["costPoints"],
      f"{points_after_redeem} vs {points_now - prize['costPoints']}")

rid = r.get("redemption", {}).get("id")
st, r = call("POST", f"/redemptions/{rid}/status", {"status": "done"}, token=mt)
check("merchant marks redemption done", st == 200, str(st))

# 清理大额商品
st, r = call("DELETE", f"/merchant/products/{big_pid}/delete", token=mt)
check("cleanup high-value product", st == 200, str(st))

# 11. 下单后自取消：退款 + 回滚库存
st, r = call("GET", f"/products/{pid}")
stock_before = r["product"]["stock"]
st, r = call("POST", "/orders", {"productId": pid, "quantity": 3, "payMethod": "balance"}, token=ut)
oid2 = r.get("order", {}).get("id")
check("second order created", st == 200, f"{st} {r.get('error', '')}")
st, r = call("GET", "/auth/me", token=ut)
bal_mid = r["user"]["balanceCents"]
st, r = call("POST", f"/orders/{oid2}/cancel", token=ut)
check("member self-cancel", st == 200 and r.get("order", {}).get("status") == "cancelled", str(st))
st, r = call("GET", "/auth/me", token=ut)
check("balance refunded 3000", r["user"]["balanceCents"] == bal_mid + 3000,
      f"{bal_mid} -> {r['user']['balanceCents']}")
st, r = call("GET", f"/products/{pid}")
check("stock restored", r["product"]["stock"] == stock_before, f"{stock_before} -> {r['product']['stock']}")

# 12. 公告
st, r = call("GET", "/announcements")
check("announcements list", st == 200 and len(r.get("announcements", [])) == 3, str(st))
st, r = call("POST", "/merchant/announcements", {"title": "E2E", "content": "临时"}, token=mt)
aid = r.get("announcement", {}).get("id")
check("merchant create announcement", st == 200 and aid is not None, str(st))
st, r = call("DELETE", f"/merchant/announcements/{aid}/delete", token=mt)
check("merchant delete announcement", st == 200, str(st))

# 13. 概览
st, r = call("GET", "/merchant/stats", token=mt)
s = r.get("stats", {})
check("stats payload", st == 200 and "salesCents" in s and "memberCount" in s, str(sorted(s)[:6]))
check("stats orderCount > 0", s.get("orderCount", 0) > 0, str(s.get("orderCount")))

# 14. 下架后不可下单
st, r = call("POST", f"/products/{pid}/status", {"status": "off"}, token=mt)
check("merchant off-shelf", st == 200 and r.get("product", {}).get("status") == "off", str(st))
st, r = call("POST", "/orders", {"productId": pid, "quantity": 1, "payMethod": "onsite"}, token=ut)
check("off-shelf order blocked", st == 400 and "下架" in r.get("error", ""), f"{st} {r.get('error', '')}")

# 15. 清理测试商品
st, r = call("DELETE", f"/merchant/products/{pid}/delete", token=mt)
check("cleanup test product", st == 200, str(st))

# 16. 订单日期筛选
today = date.today().strftime("%Y-%m-%d")
tomorrow = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
st, r = call("GET", f"/orders?dateFrom={today}&dateTo={today}", token=mt)
check("orders filtered by today", st == 200 and len(r.get("orders", [])) > 0,
      f"{st} n={len(r.get('orders', []))}")
st, r = call("GET", f"/orders?dateFrom={tomorrow}", token=mt)
check("future dateFrom -> empty", st == 200 and len(r.get("orders", [])) == 0,
      f"{st} n={len(r.get('orders', []))}")
st, r = call("GET", "/orders?dateFrom=2026/01/01", token=mt)
check("bad date format -> 400", st == 400, f"{st} {r.get('error', '')}")
st, r = call("GET", f"/orders?dateFrom={tomorrow}&dateTo={today}", token=mt)
check("dateFrom later than dateTo -> 400", st == 400, f"{st} {r.get('error', '')}")

# 17. 图片上传
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
st, r = call_multipart("/merchant/upload", "file", "a.png", TINY_PNG, "image/png", token=mt)
upload_url = r.get("url")
check("merchant upload png", st == 200 and bool(upload_url) and upload_url.startswith("/media/uploads/"),
      f"{st} {r}")
if upload_url:
    st2, body = call_raw("http://127.0.0.1:8000" + upload_url)
    check("uploaded file is served back", st2 == 200 and body.startswith(b"\x89PNG"),
          f"{st2} size={len(body)}")
st, r = call_multipart("/merchant/upload", "file", "a.png", TINY_PNG, "image/png")
check("upload without token -> 401", st == 401, str(st))
st, r = call_multipart("/merchant/upload", "file", "x.png", b"not an image at all", "image/png", token=mt)
check("non-image rejected -> 400", st == 400, f"{st} {r.get('error', '')}")
st, r = call_multipart("/merchant/upload", "file", "evil.png",
                       b"<?php system($_GET['c']); ?>", "image/png", token=mt)
check("fake image (magic bytes wrong) rejected", st == 400, f"{st} {r.get('error', '')}")

# 18. 营收趋势
st, r = call("GET", "/merchant/stats?days=7", token=mt)
trend = r.get("stats", {}).get("revenueTrend", [])
check("revenueTrend has 7 points", st == 200 and len(trend) == 7, f"{st} n={len(trend)}")
check("revenueTrend ends today", bool(trend) and trend[-1]["date"] == today,
      trend[-1]["date"] if trend else "")
check("revenueTrend fields", all({"date", "salesCents", "orderCount"} <= set(p) for p in trend),
      str(trend[-1:]))
st, r = call("GET", "/merchant/stats?days=30", token=mt)
check("revenueTrend has 30 points",
      len(r.get("stats", {}).get("revenueTrend", [])) == 30,
      str(len(r.get("stats", {}).get("revenueTrend", []))))
st, r = call("GET", "/merchant/stats?days=abc", token=mt)
check("bad days -> 400", st == 400, f"{st} {r.get('error', '')}")

failed = [n for n, okk, _ in results if not okk]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
if failed:
    print("FAILED: " + ", ".join(failed))
    raise SystemExit(1)
