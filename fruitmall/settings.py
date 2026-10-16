"""Django 项目配置：果子来了 · 水果店铺预约订购平台。"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# 本地开发直接用默认值；服务器上通过 deploy/.env 注入环境变量覆盖（见 deploy/bootstrap.sh）
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "django-insecure-guozilaile-dev-key-change-me-in-production"
)
DEBUG = os.environ.get("DJANGO_DEBUG", "1").lower() in ("1", "true", "yes", "on")
ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",") if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "shop",
]

MIDDLEWARE = [
    "fruitmall.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "fruitmall.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # frontend：PC 版页面；mobile：移动端两个 APP 的入口页面
        "DIRS": [BASE_DIR / "frontend", BASE_DIR / "mobile"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "fruitmall.wsgi.application"

# SQLite 不会自动创建父目录，这里兜底创建，
# 否则新克隆的仓库或首次部署执行 migrate 会报 "unable to open database file"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "db.sqlite3",
    }
}

AUTH_USER_MODEL = "shop.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 6}},
]

LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = False  # 使用本地时间，便于前台直接展示

STATIC_URL = "static/"
STATICFILES_DIRS = [
    BASE_DIR / "frontend" / "static",   # PC 版资源 + Vue/Bootstrap
    BASE_DIR / "mobile",                # 移动端资源：/static/shared、/static/customer、/static/merchant
]
# 生产环境 collectstatic 的汇总目录，由 nginx 直接托管
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
