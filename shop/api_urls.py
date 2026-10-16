"""API 路由表。"""
from django.urls import path

from . import api

urlpatterns = [
    path("health", api.health),

    # 账户
    path("auth/register", api.register),
    path("auth/login", api.login),
    path("auth/logout", api.logout),
    path("auth/me", api.me),
    path("auth/profile", api.update_profile),

    # 商品（客户端只读；商户端增删改）
    path("products", api.product_list),
    path("products/<int:product_id>", api.product_detail),
    path("products/<int:product_id>/status", api.product_status),
    path("merchant/products", api.product_create),
    path("merchant/products/<int:product_id>", api.product_update),
    path("merchant/products/<int:product_id>/delete", api.product_delete),

    # 预约订单
    path("orders", api.orders),
    path("orders/<int:order_id>", api.order_detail),
    path("orders/<int:order_id>/cancel", api.order_cancel),
    path("merchant/orders/<int:order_id>/status", api.order_status),

    # 积分与奖品
    path("prizes", api.prize_list),
    path("redemptions", api.redemptions),
    path("redemptions/<int:redemption_id>/status", api.redemption_status),
    path("merchant/prizes", api.prize_create),
    path("merchant/prizes/<int:prize_id>", api.prize_update),
    path("merchant/prizes/<int:prize_id>/delete", api.prize_delete),

    # 会员管理
    path("merchant/members", api.member_list),
    path("merchant/members/<int:member_id>", api.member_detail),
    path("merchant/members/<int:member_id>/balance", api.member_balance),

    # 公告
    path("announcements", api.announcement_list),
    path("merchant/announcements", api.announcement_create),
    path("merchant/announcements/<int:announcement_id>", api.announcement_update),
    path("merchant/announcements/<int:announcement_id>/delete", api.announcement_delete),

    # 商户概览
    path("merchant/stats", api.stats),
]
