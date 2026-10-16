"""数据模型：会员、商品、预约订单、积分奖品、公告、资金/积分流水。"""
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """平台账户：会员与商户（管理员）共用。"""

    ROLE_MEMBER = "member"
    ROLE_ADMIN = "admin"

    phone = models.CharField("手机号", max_length=20, unique=True)
    nickname = models.CharField("昵称", max_length=32, blank=True)
    role = models.CharField("角色", max_length=10, default=ROLE_MEMBER)
    balance_cents = models.IntegerField("账户余额(分)", default=0)
    points = models.IntegerField("积分", default=0)

    class Meta:
        db_table = "shop_user"
        verbose_name = "平台账户"
        verbose_name_plural = "平台账户"

    def __str__(self):
        return f"{self.nickname or self.phone}({self.phone})"

    @property
    def is_merchant(self) -> bool:
        return self.role == self.ROLE_ADMIN or self.is_superuser

    def to_dict(self):
        return {
            "id": self.id,
            "phone": self.phone,
            "nickname": self.nickname or self.phone,
            "role": self.role,
            "isMerchant": self.is_merchant,
            "balanceCents": self.balance_cents,
            "points": self.points,
            "createdAt": self.date_joined.strftime("%Y-%m-%d %H:%M:%S"),
            "lastLogin": self.last_login.strftime("%Y-%m-%d %H:%M:%S") if self.last_login else "",
        }


class AuthToken(models.Model):
    """登录令牌，前端通过 Authorization: Bearer <key> 携带。"""

    key = models.CharField(max_length=64, primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tokens")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_auth_token"


class Product(models.Model):
    """商品（水果）。"""

    STATUS_ON = "on"
    STATUS_OFF = "off"

    name = models.CharField("名称", max_length=64)
    category = models.CharField("分类", max_length=32, default="时令鲜果")
    price_cents = models.IntegerField("售价(分)", default=0)
    origin_price_cents = models.IntegerField("划线价(分)", null=True, blank=True)
    unit = models.CharField("规格单位", max_length=32, default="份")
    stock = models.IntegerField("库存", default=0)
    sales = models.IntegerField("已售", default=0)
    description = models.TextField("商品详情", blank=True)
    image_url = models.CharField("主图", max_length=512, blank=True)
    status = models.CharField("状态", max_length=8, default=STATUS_ON)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "shop_product"
        ordering = ["-created_at"]
        verbose_name = "商品"
        verbose_name_plural = "商品"

    def __str__(self):
        return self.name

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "priceCents": self.price_cents,
            "originPriceCents": self.origin_price_cents or 0,
            "unit": self.unit,
            "stock": self.stock,
            "sales": self.sales,
            "description": self.description,
            "imageUrl": self.image_url,
            "status": self.status,
            "createdAt": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else "",
            "updatedAt": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else "",
        }


class Order(models.Model):
    """预约订购单。"""

    STATUS_PENDING = "pending"      # 待商户确认
    STATUS_CONFIRMED = "confirmed"  # 已确认
    STATUS_COMPLETED = "completed"  # 已完成（已取货）
    STATUS_CANCELLED = "cancelled"  # 已取消

    STATUS_TEXT = {
        STATUS_PENDING: "待确认",
        STATUS_CONFIRMED: "已确认",
        STATUS_COMPLETED: "已完成",
        STATUS_CANCELLED: "已取消",
    }

    PAY_BALANCE = "balance"
    PAY_ONSITE = "onsite"

    order_no = models.CharField("订单号", max_length=32, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="orders")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, related_name="orders")
    product_name = models.CharField("商品名称快照", max_length=64)
    unit_price_cents = models.IntegerField("成交单价(分)", default=0)
    quantity = models.IntegerField("数量", default=1)
    total_cents = models.IntegerField("订单金额(分)", default=0)
    pickup_time = models.CharField("预约取货时间", max_length=64, blank=True)
    pay_method = models.CharField("支付方式", max_length=16, default=PAY_ONSITE)
    status = models.CharField("状态", max_length=16, default=STATUS_PENDING)
    points_gained = models.IntegerField("已获积分", default=0)
    note = models.CharField("备注", max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "shop_order"
        ordering = ["-created_at"]
        verbose_name = "预约订单"
        verbose_name_plural = "预约订单"

    def __str__(self):
        return self.order_no

    @property
    def status_text(self):
        return self.STATUS_TEXT.get(self.status, self.status)

    def to_dict(self):
        return {
            "id": self.id,
            "orderNo": self.order_no,
            "userId": self.user_id,
            "memberName": self.user.nickname or self.user.phone,
            "memberPhone": self.user.phone,
            "productId": self.product_id,
            "productName": self.product_name,
            "imageUrl": self.product.image_url if self.product else "",
            "unitPriceCents": self.unit_price_cents,
            "quantity": self.quantity,
            "totalCents": self.total_cents,
            "pickupTime": self.pickup_time,
            "payMethod": self.pay_method,
            "status": self.status,
            "statusText": self.status_text,
            "pointsGained": self.points_gained,
            "note": self.note,
            "createdAt": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "updatedAt": self.updated_at.strftime("%Y-%m-%d %H:%M:%S"),
        }


class Prize(models.Model):
    """积分奖品。"""

    STATUS_ON = "on"
    STATUS_OFF = "off"

    name = models.CharField("奖品名称", max_length=64)
    cost_points = models.IntegerField("所需积分", default=0)
    stock = models.IntegerField("库存", default=0)
    description = models.CharField("说明", max_length=255, blank=True)
    image_url = models.CharField("图片", max_length=512, blank=True)
    status = models.CharField("状态", max_length=8, default=STATUS_ON)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_prize"
        ordering = ["cost_points"]
        verbose_name = "积分奖品"
        verbose_name_plural = "积分奖品"

    def __str__(self):
        return self.name

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "costPoints": self.cost_points,
            "stock": self.stock,
            "description": self.description,
            "imageUrl": self.image_url,
            "status": self.status,
            "createdAt": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else "",
        }


class Redemption(models.Model):
    """积分兑换记录。"""

    STATUS_PENDING = "pending"
    STATUS_DONE = "done"
    STATUS_CANCELLED = "cancelled"

    STATUS_TEXT = {
        STATUS_PENDING: "待发放",
        STATUS_DONE: "已发放",
        STATUS_CANCELLED: "已取消",
    }

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="redemptions")
    prize = models.ForeignKey(Prize, on_delete=models.SET_NULL, null=True, related_name="redemptions")
    prize_name = models.CharField("奖品名称快照", max_length=64)
    cost_points = models.IntegerField("消耗积分", default=0)
    status = models.CharField("状态", max_length=16, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_redemption"
        ordering = ["-created_at"]
        verbose_name = "兑换记录"
        verbose_name_plural = "兑换记录"

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "memberName": self.user.nickname or self.user.phone,
            "memberPhone": self.user.phone,
            "prizeId": self.prize_id,
            "prizeName": self.prize_name,
            "imageUrl": self.prize.image_url if self.prize else "",
            "costPoints": self.cost_points,
            "status": self.status,
            "statusText": self.STATUS_TEXT.get(self.status, self.status),
            "createdAt": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        }


class Announcement(models.Model):
    """门店公告。"""

    title = models.CharField("标题", max_length=128)
    content = models.TextField("内容", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_announcement"
        ordering = ["-created_at"]
        verbose_name = "公告"
        verbose_name_plural = "公告"

    def __str__(self):
        return self.title

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "createdAt": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else "",
        }


class BalanceLog(models.Model):
    """会员余额变动流水。"""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="balance_logs")
    change_cents = models.IntegerField("变动金额(分)")
    balance_after = models.IntegerField("变动后余额(分)")
    reason = models.CharField("事由", max_length=128, blank=True)
    operator = models.CharField("操作人", max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_balance_log"
        ordering = ["-created_at"]
        verbose_name = "余额流水"
        verbose_name_plural = "余额流水"

    def to_dict(self):
        return {
            "id": self.id,
            "changeCents": self.change_cents,
            "balanceAfter": self.balance_after,
            "reason": self.reason,
            "operator": self.operator,
            "createdAt": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        }


class PointsLog(models.Model):
    """会员积分变动流水。"""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="points_logs")
    change = models.IntegerField("变动积分")
    points_after = models.IntegerField("变动后积分")
    reason = models.CharField("事由", max_length=128, blank=True)
    operator = models.CharField("操作人", max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "shop_points_log"
        ordering = ["-created_at"]
        verbose_name = "积分流水"
        verbose_name_plural = "积分流水"

    def to_dict(self):
        return {
            "id": self.id,
            "change": self.change,
            "pointsAfter": self.points_after,
            "reason": self.reason,
            "operator": self.operator,
            "createdAt": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        }
