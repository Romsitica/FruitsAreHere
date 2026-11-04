"""接口鉴权：基于令牌的登录态与视图装饰器。"""
import json
import re
import secrets
from functools import wraps

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import AuthToken

TOKEN_HEADER = "Authorization"


class ApiError(Exception):
    """业务异常，会被统一转换为 JSON 错误响应。"""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def issue_token(user) -> str:
    key = secrets.token_hex(24)
    AuthToken.objects.create(key=key, user=user)
    return key


def current_user(request):
    """从请求头或查询串解析登录用户，未登录返回 None。"""
    header = request.headers.get(TOKEN_HEADER, "")
    key = header[7:].strip() if header.startswith("Bearer ") else request.GET.get("token", "")
    if not key:
        return None
    token = AuthToken.objects.select_related("user").filter(key=key).first()
    return token.user if token else None


def revoke_token(request):
    header = request.headers.get(TOKEN_HEADER, "")
    if header.startswith("Bearer "):
        AuthToken.objects.filter(key=header[7:].strip()).delete()


def body(request) -> dict:
    """解析 JSON 请求体。"""
    if not request.body:
        return {}
    try:
        data = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ApiError("请求数据格式有误")
    if not isinstance(data, dict):
        raise ApiError("请求数据格式有误")
    return data


INTEGER_RE = re.compile(r"-?\d+")


def to_int(value, field, default=None, minimum=None, maximum=None):
    """严格取整：拒绝小数与布尔值（历史实现 int(1.5) 会把数量静默截断成 1）。

    约定：接受 JSON 整数和「整数形式的字符串」（如 "5"），拒绝 1.5、1.0、true、"1.5"。
    """
    if value is None or value == "":
        if default is None:
            raise ApiError(f"缺少参数：{field}")
        return default
    if isinstance(value, bool) or isinstance(value, float):
        raise ApiError(f"参数 {field} 需为整数")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and INTEGER_RE.fullmatch(value.strip()):
        number = int(value.strip())
    else:
        raise ApiError(f"参数 {field} 需为整数")
    if minimum is not None and number < minimum:
        raise ApiError(f"参数 {field} 不能小于 {minimum}")
    if maximum is not None and number > maximum:
        raise ApiError(f"参数 {field} 不能大于 {maximum}")
    return number


def need_str(data, field, max_length=128, required=True, default=""):
    value = str(data.get(field, default) or "").strip()
    if required and not value:
        raise ApiError(f"缺少参数：{field}")
    if len(value) > max_length:
        raise ApiError(f"参数 {field} 长度不能超过 {max_length}")
    return value


def api(methods=("GET",), auth=False, merchant=False):
    """统一包装 API 视图：方法校验 + 登录/权限校验 + 异常兜底。"""

    def decorator(fn):
        @csrf_exempt
        @wraps(fn)
        def wrapper(request, *args, **kwargs):
            if request.method not in methods:
                return JsonResponse(
                    {"ok": False, "error": f"不支持的请求方法 {request.method}"}, status=405
                )
            user = None
            if auth or merchant:
                user = current_user(request)
                if user is None:
                    return JsonResponse({"ok": False, "error": "请先登录"}, status=401)
                if merchant and not user.is_merchant:
                    return JsonResponse({"ok": False, "error": "仅商户可操作"}, status=403)
            request.user_obj = user
            try:
                return fn(request, *args, **kwargs)
            except ApiError as exc:
                return JsonResponse({"ok": False, "error": exc.message}, status=exc.status)

        return wrapper

    return decorator


def ok(**payload):
    return JsonResponse({"ok": True, **payload})
