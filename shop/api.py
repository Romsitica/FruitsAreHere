"""平台接口：会员、商品、预约订单、积分奖品、余额与公告。"""
import random
import re
from datetime import datetime

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import Count, Q, Sum

from .auth import (
    ApiError,
    api,
    body,
    issue_token,
    need_str,
    ok,
    revoke_token,
    to_int,
)
from .models import (
    Announcement,
    BalanceLog,
    Order,
    PointsLog,
    Prize,
    Product,
    Redemption,
    User,
)

PHONE_RE = re.compile(r"^1[3-9]\d{9}$")
POINTS_PER_YUAN = 1  # 每消费 1 元累计 1 积分


# ---------------------------------------------------------------- 内部工具
def _adjust_balance(user, change_cents, reason, operator=""):
    user.balance_cents += change_cents
    user.save(update_fields=["balance_cents"])
    BalanceLog.objects.create(
        user=user,
        change_cents=change_cents,
        balance_after=user.balance_cents,
        reason=reason,
        operator=operator,
    )


def _adjust_points(user, change, reason, operator=""):
    user.points += change
    user.save(update_fields=["points"])
    PointsLog.objects.create(
        user=user,
        change=change,
        points_after=user.points,
        reason=reason,
        operator=operator,
    )


def _new_order_no():
    return "FR" + datetime.now().strftime("%y%m%d%H%M%S") + str(random.randint(1000, 9999))


def _merchant_name(user):
    return user.nickname or user.phone


# ---------------------------------------------------------------- 账户
@api(methods=("POST",))
def register(request):
    data = body(request)
    phone = need_str(data, "phone", max_length=11)
    password = need_str(data, "password", max_length=64)
    nickname = need_str(data, "nickname", max_length=32, required=False)

    if not PHONE_RE.match(phone):
        raise ApiError("手机号格式不正确")
    if len(password) < 6:
        raise ApiError("密码至少 6 位")
    if User.objects.filter(phone=phone).exists():
        raise ApiError("该手机号已注册，请直接登录")

    user = User.objects.create(
        username=phone,
        phone=phone,
        nickname=nickname or f"果友{phone[-4:]}",
        role=User.ROLE_MEMBER,
        password=make_password(password),
    )
    return ok(token=issue_token(user), user=user.to_dict())


@api(methods=("POST",))
def login(request):
    data = body(request)
    phone = need_str(data, "phone", max_length=11)
    password = need_str(data, "password", max_length=64)

    user = User.objects.filter(phone=phone).first()
    if user is None or not check_password(password, user.password):
        raise ApiError("手机号或密码不正确", status=401)

    user.last_login = datetime.now()
    user.save(update_fields=["last_login"])
    return ok(token=issue_token(user), user=user.to_dict())


@api(methods=("POST",), auth=True)
def logout(request):
    revoke_token(request)
    return ok()


@api(methods=("GET",), auth=True)
def me(request):
    user = request.user_obj
    return ok(
        user=user.to_dict(),
        balanceLogs=[log.to_dict() for log in user.balance_logs.all()[:20]],
        pointsLogs=[log.to_dict() for log in user.points_logs.all()[:20]],
    )


@api(methods=("POST",), auth=True)
def update_profile(request):
    data = body(request)
    user = request.user_obj
    nickname = need_str(data, "nickname", max_length=32)
    user.nickname = nickname
    user.save(update_fields=["nickname"])
    return ok(user=user.to_dict())


# ---------------------------------------------------------------- 商品
@api(methods=("GET",), auth=False)
def product_list(request):
    scope = request.GET.get("scope", "")
    user = None if scope != "all" else request.user_obj
    if scope == "all":
        from .auth import current_user

        user = current_user(request)
        if user is None or not user.is_merchant:
            scope = ""

    qs = Product.objects.all()
    if scope != "all":
        qs = qs.filter(status=Product.STATUS_ON)

    keyword = request.GET.get("keyword", "").strip()
    if keyword:
        qs = qs.filter(Q(name__icontains=keyword) | Q(description__icontains=keyword))
    category = request.GET.get("category", "").strip()
    if category and category != "全部":
        qs = qs.filter(category=category)

    return ok(
        products=[p.to_dict() for p in qs],
        categories=list(
            Product.objects.order_by().values_list("category", flat=True).distinct()
        ),
    )


@api(methods=("GET",))
def product_detail(request, product_id):
    product = Product.objects.filter(id=product_id).first()
    if product is None:
        raise ApiError("商品不存在", status=404)
    return ok(product=product.to_dict())


@api(methods=("POST",), merchant=True)
def product_create(request):
    data = body(request)
    product = Product(
        name=need_str(data, "name", max_length=64),
        category=need_str(data, "category", max_length=32, required=False, default="时令鲜果"),
        price_cents=to_int(data.get("priceCents"), "priceCents", minimum=0),
        origin_price_cents=to_int(data.get("originPriceCents"), "originPriceCents", default=0, minimum=0),
        unit=need_str(data, "unit", max_length=32, required=False, default="份"),
        stock=to_int(data.get("stock"), "stock", default=0, minimum=0),
        description=need_str(data, "description", max_length=2000, required=False),
        image_url=need_str(data, "imageUrl", max_length=512, required=False),
        status=Product.STATUS_ON if data.get("status", "on") == "on" else Product.STATUS_OFF,
    )
    if product.origin_price_cents == 0:
        product.origin_price_cents = None
    product.save()
    return ok(product=product.to_dict())


@api(methods=("PUT", "PATCH"), merchant=True)
def product_update(request, product_id):
    product = Product.objects.filter(id=product_id).first()
    if product is None:
        raise ApiError("商品不存在", status=404)
    data = body(request)

    if "name" in data:
        product.name = need_str(data, "name", max_length=64)
    if "category" in data:
        product.category = need_str(data, "category", max_length=32, required=False, default="时令鲜果")
    if "priceCents" in data:
        product.price_cents = to_int(data.get("priceCents"), "priceCents", minimum=0)
    if "originPriceCents" in data:
        product.origin_price_cents = to_int(data.get("originPriceCents"), "originPriceCents", default=0, minimum=0) or None
    if "unit" in data:
        product.unit = need_str(data, "unit", max_length=32, required=False, default="份")
    if "stock" in data:
        product.stock = to_int(data.get("stock"), "stock", default=0, minimum=0)
    if "description" in data:
        product.description = need_str(data, "description", max_length=2000, required=False)
    if "imageUrl" in data:
        product.image_url = need_str(data, "imageUrl", max_length=512, required=False)
    product.save()
    return ok(product=product.to_dict())


@api(methods=("POST",), merchant=True)
def product_status(request, product_id):
    product = Product.objects.filter(id=product_id).first()
    if product is None:
        raise ApiError("商品不存在", status=404)
    status = body(request).get("status")
    if status not in (Product.STATUS_ON, Product.STATUS_OFF):
        raise ApiError("状态只能为 on（上架）或 off（下架）")
    product.status = status
    product.save(update_fields=["status", "updated_at"])
    return ok(product=product.to_dict())


@api(methods=("DELETE",), merchant=True)
def product_delete(request, product_id):
    product = Product.objects.filter(id=product_id).first()
    if product is None:
        raise ApiError("商品不存在", status=404)
    product.delete()
    return ok()


# ---------------------------------------------------------------- 预约订单
def _create_order(request):
    user = request.user_obj
    data = body(request)
    product_id = to_int(data.get("productId"), "productId")
    quantity = to_int(data.get("quantity"), "quantity", default=1, minimum=1, maximum=99)
    pickup_time = need_str(data, "pickupTime", max_length=64, required=False)
    pay_method = data.get("payMethod", Order.PAY_ONSITE)
    note = need_str(data, "note", max_length=128, required=False)

    if pay_method not in (Order.PAY_BALANCE, Order.PAY_ONSITE):
        raise ApiError("支付方式不正确")

    with transaction.atomic():
        product = Product.objects.select_for_update().filter(id=product_id).first()
        if product is None:
            raise ApiError("商品不存在", status=404)
        if product.status != Product.STATUS_ON:
            raise ApiError("该商品已下架，无法预约")
        if product.stock < quantity:
            raise ApiError(f"库存不足，当前仅剩 {product.stock} {product.unit}")

        total = product.price_cents * quantity
        user = User.objects.select_for_update().get(id=user.id)
        if pay_method == Order.PAY_BALANCE:
            if user.balance_cents < total:
                raise ApiError("账户余额不足，请选择到店支付或先充值")

        product.stock -= quantity
        product.sales += quantity
        product.save(update_fields=["stock", "sales", "updated_at"])

        order = Order.objects.create(
            order_no=_new_order_no(),
            user=user,
            product=product,
            product_name=product.name,
            unit_price_cents=product.price_cents,
            quantity=quantity,
            total_cents=total,
            pickup_time=pickup_time,
            pay_method=pay_method,
            note=note,
        )

        if pay_method == Order.PAY_BALANCE:
            _adjust_balance(user, -total, f"预约订单 {order.order_no} 余额支付", "系统")

    return ok(order=order.to_dict())


def _list_orders(request):
    user = request.user_obj
    qs = Order.objects.select_related("user", "product")
    if not user.is_merchant:
        qs = qs.filter(user=user)

    status = request.GET.get("status", "").strip()
    if status and status != "all":
        qs = qs.filter(status=status)
    keyword = request.GET.get("keyword", "").strip()
    if keyword:
        qs = qs.filter(
            Q(order_no__icontains=keyword)
            | Q(product_name__icontains=keyword)
            | Q(user__phone__icontains=keyword)
            | Q(user__nickname__icontains=keyword)
        )
    return ok(orders=[o.to_dict() for o in qs[:300]])


@api(methods=("GET", "POST"), auth=True)
def orders(request):
    """GET 查询预约订单（会员看自己的，商户看全部）；POST 提交预约。"""
    if request.method == "POST":
        return _create_order(request)
    return _list_orders(request)


@api(methods=("GET",), auth=True)
def order_detail(request, order_id):
    user = request.user_obj
    order = Order.objects.select_related("user", "product").filter(id=order_id).first()
    if order is None:
        raise ApiError("订单不存在", status=404)
    if not user.is_merchant and order.user_id != user.id:
        raise ApiError("无权查看该订单", status=403)
    return ok(order=order.to_dict())


@api(methods=("POST",), merchant=True)
def order_status(request, order_id):
    operator = _merchant_name(request.user_obj)
    target = body(request).get("status")
    if target not in (Order.STATUS_CONFIRMED, Order.STATUS_COMPLETED, Order.STATUS_CANCELLED):
        raise ApiError("状态只能为 confirmed / completed / cancelled")

    with transaction.atomic():
        order = Order.objects.select_related("product", "user").filter(id=order_id).first()
        if order is None:
            raise ApiError("订单不存在", status=404)
        if order.status in (Order.STATUS_COMPLETED, Order.STATUS_CANCELLED):
            raise ApiError(f"订单已{order.status_text}，不能再变更")

        if target == Order.STATUS_CONFIRMED:
            if order.status != Order.STATUS_PENDING:
                raise ApiError("仅待确认订单可以确认")
            order.status = Order.STATUS_CONFIRMED

        elif target == Order.STATUS_COMPLETED:
            order.status = Order.STATUS_COMPLETED
            points = order.total_cents // 100 * POINTS_PER_YUAN
            if points:
                member = User.objects.select_for_update().get(id=order.user_id)
                _adjust_points(member, points, f"订单 {order.order_no} 消费奖励", operator)
                order.points_gained = points

        else:  # 取消
            order.status = Order.STATUS_CANCELLED
            _restore_stock(order)
            if order.pay_method == Order.PAY_BALANCE:
                member = User.objects.select_for_update().get(id=order.user_id)
                _adjust_balance(member, order.total_cents, f"订单 {order.order_no} 取消退款", operator)

        order.save()
    return ok(order=order.to_dict())


def _restore_stock(order):
    """取消订单时归还库存与销量。"""
    if order.product_id:
        product = Product.objects.select_for_update().filter(id=order.product_id).first()
        if product:
            product.stock += order.quantity
            product.sales = max(0, product.sales - order.quantity)
            product.save(update_fields=["stock", "sales", "updated_at"])


@api(methods=("POST",), auth=True)
def order_cancel(request, order_id):
    user = request.user_obj
    with transaction.atomic():
        order = Order.objects.select_related("product", "user").filter(id=order_id).first()
        if order is None:
            raise ApiError("订单不存在", status=404)
        if order.user_id != user.id and not user.is_merchant:
            raise ApiError("无权操作该订单", status=403)
        if order.status in (Order.STATUS_COMPLETED, Order.STATUS_CANCELLED):
            raise ApiError(f"订单已{order.status_text}，无法取消")

        order.status = Order.STATUS_CANCELLED
        _restore_stock(order)
        if order.pay_method == Order.PAY_BALANCE:
            buyer = User.objects.select_for_update().get(id=order.user_id)
            _adjust_balance(buyer, order.total_cents, f"订单 {order.order_no} 取消退款", "会员自助取消")
        order.save()
    return ok(order=order.to_dict())


# ---------------------------------------------------------------- 积分奖品
@api(methods=("GET",))
def prize_list(request):
    scope = request.GET.get("scope", "")
    qs = Prize.objects.all()
    if scope != "all":
        qs = qs.filter(status=Prize.STATUS_ON)
    return ok(prizes=[p.to_dict() for p in qs])


@api(methods=("POST",), merchant=True)
def prize_create(request):
    data = body(request)
    prize = Prize.objects.create(
        name=need_str(data, "name", max_length=64),
        cost_points=to_int(data.get("costPoints"), "costPoints", minimum=1),
        stock=to_int(data.get("stock"), "stock", default=0, minimum=0),
        description=need_str(data, "description", max_length=255, required=False),
        image_url=need_str(data, "imageUrl", max_length=512, required=False),
        status=Prize.STATUS_ON if data.get("status", "on") == "on" else Prize.STATUS_OFF,
    )
    return ok(prize=prize.to_dict())


@api(methods=("PUT", "PATCH"), merchant=True)
def prize_update(request, prize_id):
    prize = Prize.objects.filter(id=prize_id).first()
    if prize is None:
        raise ApiError("奖品不存在", status=404)
    data = body(request)
    if "name" in data:
        prize.name = need_str(data, "name", max_length=64)
    if "costPoints" in data:
        prize.cost_points = to_int(data.get("costPoints"), "costPoints", minimum=1)
    if "stock" in data:
        prize.stock = to_int(data.get("stock"), "stock", default=0, minimum=0)
    if "description" in data:
        prize.description = need_str(data, "description", max_length=255, required=False)
    if "imageUrl" in data:
        prize.image_url = need_str(data, "imageUrl", max_length=512, required=False)
    if "status" in data:
        prize.status = Prize.STATUS_ON if data.get("status") == "on" else Prize.STATUS_OFF
    prize.save()
    return ok(prize=prize.to_dict())


@api(methods=("DELETE",), merchant=True)
def prize_delete(request, prize_id):
    prize = Prize.objects.filter(id=prize_id).first()
    if prize is None:
        raise ApiError("奖品不存在", status=404)
    prize.delete()
    return ok()


def _list_redemptions(request):
    user = request.user_obj
    qs = Redemption.objects.select_related("user", "prize")
    if not user.is_merchant:
        qs = qs.filter(user=user)
    status = request.GET.get("status", "").strip()
    if status and status != "all":
        qs = qs.filter(status=status)
    return ok(redemptions=[r.to_dict() for r in qs[:300]])


@api(methods=("GET", "POST"), auth=True)
def redemptions(request):
    """GET 查询兑换记录；POST 提交积分兑换。"""
    if request.method == "POST":
        return _create_redemption(request)
    return _list_redemptions(request)


def _create_redemption(request):
    user = request.user_obj
    prize_id = to_int(body(request).get("prizeId"), "prizeId")

    with transaction.atomic():
        prize = Prize.objects.select_for_update().filter(id=prize_id).first()
        if prize is None:
            raise ApiError("奖品不存在", status=404)
        if prize.status != Prize.STATUS_ON:
            raise ApiError("该奖品已下架")
        if prize.stock <= 0:
            raise ApiError("奖品已被兑完")

        member = User.objects.select_for_update().get(id=user.id)
        if member.points < prize.cost_points:
            raise ApiError(f"积分不足，本次需要 {prize.cost_points} 积分，当前 {member.points} 积分")

        prize.stock -= 1
        prize.save(update_fields=["stock"])
        _adjust_points(member, -prize.cost_points, f"兑换奖品「{prize.name}」", "会员自助兑换")
        redemption = Redemption.objects.create(
            user=member,
            prize=prize,
            prize_name=prize.name,
            cost_points=prize.cost_points,
        )
        payload = redemption.to_dict()
        payload["memberPoints"] = member.points

    return ok(redemption=payload, prize=prize.to_dict())


@api(methods=("POST",), merchant=True)
def redemption_status(request, redemption_id):
    operator = _merchant_name(request.user_obj)
    target = body(request).get("status")
    if target not in (Redemption.STATUS_DONE, Redemption.STATUS_CANCELLED):
        raise ApiError("状态只能为 done / cancelled")

    with transaction.atomic():
        item = Redemption.objects.filter(id=redemption_id).first()
        if item is None:
            raise ApiError("兑换记录不存在", status=404)
        if item.status != Redemption.STATUS_PENDING:
            raise ApiError(f"该兑换记录已{item.status_text}")

        item.status = target
        if target == Redemption.STATUS_CANCELLED:
            member = User.objects.select_for_update().get(id=item.user_id)
            _adjust_points(member, item.cost_points, f"兑换「{item.prize_name}」取消退还", operator)
            prize = Prize.objects.select_for_update().filter(id=item.prize_id).first()
            if prize:
                prize.stock += 1
                prize.save(update_fields=["stock"])
        item.save()
    return ok(redemption=item.to_dict())


# ---------------------------------------------------------------- 会员管理（商户）
@api(methods=("GET",), merchant=True)
def member_list(request):
    qs = User.objects.filter(role=User.ROLE_MEMBER).annotate(
        order_count=Count("orders", distinct=True),
        total_spent=Sum("orders__total_cents", filter=Q(orders__status=Order.STATUS_COMPLETED)),
    )
    keyword = request.GET.get("keyword", "").strip()
    if keyword:
        qs = qs.filter(Q(phone__icontains=keyword) | Q(nickname__icontains=keyword))

    members = []
    for user in qs.order_by("-date_joined"):
        item = user.to_dict()
        item["orderCount"] = user.order_count
        item["totalSpentCents"] = user.total_spent or 0
        members.append(item)
    return ok(members=members)


@api(methods=("GET",), merchant=True)
def member_detail(request, member_id):
    user = User.objects.filter(id=member_id).first()
    if user is None:
        raise ApiError("会员不存在", status=404)
    return ok(
        member=user.to_dict(),
        balanceLogs=[log.to_dict() for log in user.balance_logs.all()[:50]],
        pointsLogs=[log.to_dict() for log in user.points_logs.all()[:50]],
        orders=[o.to_dict() for o in user.orders.select_related("product")[:20]],
    )


@api(methods=("POST",), merchant=True)
def member_balance(request, member_id):
    """调整会员余额：changeCents 为正表示充值，为负表示扣减。"""
    data = body(request)
    change = to_int(data.get("changeCents"), "changeCents")
    if change == 0:
        raise ApiError("变动金额不能为 0")
    reason = need_str(data, "reason", max_length=128, required=False, default="商户调整余额")
    operator = _merchant_name(request.user_obj)

    with transaction.atomic():
        user = User.objects.select_for_update().filter(id=member_id).first()
        if user is None:
            raise ApiError("会员不存在", status=404)
        if user.balance_cents + change < 0:
            raise ApiError("调整后余额不能为负数")
        _adjust_balance(user, change, reason, operator)
    return ok(member=user.to_dict())


# ---------------------------------------------------------------- 公告
@api(methods=("GET",))
def announcement_list(request):
    items = Announcement.objects.all()[:50]
    return ok(announcements=[a.to_dict() for a in items])


@api(methods=("POST",), merchant=True)
def announcement_create(request):
    data = body(request)
    item = Announcement.objects.create(
        title=need_str(data, "title", max_length=128),
        content=need_str(data, "content", max_length=2000, required=False),
    )
    return ok(announcement=item.to_dict())


@api(methods=("PUT", "PATCH"), merchant=True)
def announcement_update(request, announcement_id):
    item = Announcement.objects.filter(id=announcement_id).first()
    if item is None:
        raise ApiError("公告不存在", status=404)
    data = body(request)
    if "title" in data:
        item.title = need_str(data, "title", max_length=128)
    if "content" in data:
        item.content = need_str(data, "content", max_length=2000, required=False)
    item.save()
    return ok(announcement=item.to_dict())


@api(methods=("DELETE",), merchant=True)
def announcement_delete(request, announcement_id):
    item = Announcement.objects.filter(id=announcement_id).first()
    if item is None:
        raise ApiError("公告不存在", status=404)
    item.delete()
    return ok()


# ---------------------------------------------------------------- 商户概览
@api(methods=("GET",), merchant=True)
def stats(request):
    completed = Order.objects.filter(status=Order.STATUS_COMPLETED)
    top = (
        Product.objects.annotate(order_count=Count("orders"))
        .filter(order_count__gt=0)
        .order_by("-sales")[:5]
    )
    return ok(
        stats={
            "memberCount": User.objects.filter(role=User.ROLE_MEMBER).count(),
            "productOnCount": Product.objects.filter(status=Product.STATUS_ON).count(),
            "productOffCount": Product.objects.filter(status=Product.STATUS_OFF).count(),
            "orderCount": Order.objects.count(),
            "pendingCount": Order.objects.filter(status=Order.STATUS_PENDING).count(),
            "confirmedCount": Order.objects.filter(status=Order.STATUS_CONFIRMED).count(),
            "completedCount": completed.count(),
            "salesCents": completed.aggregate(total=Sum("total_cents"))["total"] or 0,
            "balanceCents": User.objects.filter(role=User.ROLE_MEMBER).aggregate(
                total=Sum("balance_cents")
            )["total"] or 0,
            "pointsIssued": PointsLog.objects.filter(change__gt=0).aggregate(
                total=Sum("change")
            )["total"] or 0,
            "redemptionCount": Redemption.objects.count(),
            "topProducts": [
                {"id": p.id, "name": p.name, "sales": p.sales, "stock": p.stock} for p in top
            ],
        }
    )


@api(methods=("GET",))
def health(request):
    return ok(service="fruit-mall", time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
