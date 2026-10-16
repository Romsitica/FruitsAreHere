"""中间件：为移动端 APP / 真机调试放行跨域请求（不引入额外依赖）。

H5 页面由本服务同源托管时用不到；但 uni-app / Flutter / HBuilderX 真机预览、
以及独立域名部署的移动端会从其他 Origin 发起请求，需要这个中间件兜底。
"""
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers
import os

ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
ALLOW_HEADERS = "Content-Type, Authorization, X-Requested-With"

# 生产环境用 DJANGO_CORS_ORIGINS=https://a.com,https://b.com 收紧白名单；
# 留空表示开发期放行任意来源（回显 Origin，而不是写死 *）
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("DJANGO_CORS_ORIGINS", "").split(",") if o.strip()
]


class CorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 预检请求直接返回，不进入业务视图
        if request.method == "OPTIONS" and "HTTP_ACCESS_CONTROL_REQUEST_METHOD" in request.META:
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        origin = request.headers.get("Origin")
        if origin and (not ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS):
            # 回显来源而不是写死 *，便于后续收紧白名单
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Allow-Methods"] = ALLOW_METHODS
            response["Access-Control-Allow-Headers"] = ALLOW_HEADERS
            response["Access-Control-Max-Age"] = "86400"
            patch_vary_headers(response, ["Origin"])
        return response
