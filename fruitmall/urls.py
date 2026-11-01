from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.generic import TemplateView


def api_not_found(request):
    """未注册的 /api/ 路径返回 JSON 404，避免被下面的单页应用兜底路由吞成 200 + HTML。"""
    return JsonResponse({"ok": False, "error": "接口不存在"}, status=404)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("shop.api_urls")),
    re_path(r"^api/.*$", api_not_found),
    # 移动端两个独立 APP 的入口（hash 路由，刷新任意子路径都回落到各自入口）
    path("m/customer/", TemplateView.as_view(template_name="customer/index.html")),
    path("m/merchant/", TemplateView.as_view(template_name="merchant/index.html")),
    # PC 版为 Vue 单页应用（hash 路由），其余路径统一回落到入口页面
    re_path(r"^.*$", TemplateView.as_view(template_name="index.html")),
]
