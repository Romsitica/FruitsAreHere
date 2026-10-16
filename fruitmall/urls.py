from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("shop.api_urls")),
    # 移动端两个独立 APP 的入口（hash 路由，刷新任意子路径都回落到各自入口）
    path("m/customer/", TemplateView.as_view(template_name="customer/index.html")),
    path("m/merchant/", TemplateView.as_view(template_name="merchant/index.html")),
    # PC 版为 Vue 单页应用（hash 路由），其余路径统一回落到入口页面
    re_path(r"^.*$", TemplateView.as_view(template_name="index.html")),
]
