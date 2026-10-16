#!/usr/bin/env bash
# ============================================================================
# 果子来了 · 服务器一键部署脚本（在服务器上执行）
#
#   bash deploy/bootstrap.sh
#   SERVER_NAME=47.102.132.175 APP_DIR=/opt/fruits bash deploy/bootstrap.sh
#
# 做的事：装系统依赖 → 建 venv → 装依赖 → 生成 .env → 建库灌数据 →
#         collectstatic → 写 systemd → 写 nginx → 启动并自检
# 可重复执行（幂等），不会覆盖已存在的 deploy/.env
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fruits}"
SERVER_NAME="${SERVER_NAME:-47.102.132.175}"
GUNICORN_PORT="${GUNICORN_PORT:-8001}"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

log "1/9 安装系统依赖"
export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq python3-venv python3-pip nginx curl
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q nginx curl
elif command -v yum >/dev/null 2>&1; then
    yum install -y -q nginx curl
else
    echo "无法识别的系统，请手动安装 python3 / nginx / curl"; exit 1
fi

log "2/9 准备 Python 3.10+ 与虚拟环境"
# Django 5 要求 Python >= 3.10，而 Alibaba Cloud Linux 3 / CentOS 8 自带的是 3.6
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1 &&
       "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        PY="$c"; break
    fi
done
if [ -z "$PY" ]; then
    warn "系统自带 Python 低于 3.10，尝试安装 python3.11"
    if command -v dnf >/dev/null 2>&1; then
        dnf install -y python3.11 python3.11-pip
    elif command -v yum >/dev/null 2>&1; then
        yum install -y python3.11 python3.11-pip
    elif command -v apt-get >/dev/null 2>&1; then
        apt-get install -y python3.11 python3.11-venv
    fi
    for c in python3.12 python3.11; do
        command -v "$c" >/dev/null 2>&1 && PY="$c" && break
    done
fi
if [ -z "$PY" ]; then
    echo "找不到 Python 3.10+，请手动安装后重跑本脚本"; exit 1
fi
echo "使用解释器：$PY（$($PY -V 2>&1)）"

cd "$APP_DIR"
if [ ! -f manage.py ]; then
    echo "当前目录不是项目根目录（缺 manage.py）：$APP_DIR"; exit 1
fi

if [ ! -d .venv ]; then
    $PY -m venv .venv
fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r deploy/requirements-prod.txt
echo "依赖安装完成：$(.venv/bin/python -c 'import django;print("Django", django.get_version())')"

log "3/9 生成环境变量文件 deploy/.env"
mkdir -p deploy
if [ ! -f deploy/.env ]; then
    SECRET="$(.venv/bin/python -c 'import secrets;print(secrets.token_urlsafe(50))')"
    cat > deploy/.env <<EOF
DJANGO_SECRET_KEY=$SECRET
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=$SERVER_NAME,127.0.0.1,localhost
DJANGO_CORS_ORIGINS=
EOF
    chmod 600 deploy/.env
    echo "已生成新的 SECRET_KEY"
else
    echo "deploy/.env 已存在，保留原配置"
fi
set -a; . deploy/.env; set +a
echo "ALLOWED_HOSTS = $DJANGO_ALLOWED_HOSTS"

log "4/9 建表 + 灌演示数据"
mkdir -p "$APP_DIR/data" "$APP_DIR/staticfiles"
.venv/bin/python manage.py migrate --noinput
if .venv/bin/python manage.py seed; then
    echo "演示数据就绪"
else
    warn "seed 失败（可能已有数据），继续"
fi

log "5/9 收集静态文件到 staticfiles/"
.venv/bin/python manage.py collectstatic --noinput | tail -n 2

log "6/9 写入 systemd 服务"
sed "s|__APP_DIR__|$APP_DIR|g; s|__PORT__|$GUNICORN_PORT|g" deploy/gunicorn.service \
    > /etc/systemd/system/fruits.service
systemctl daemon-reload
systemctl enable fruits >/dev/null 2>&1 || true
systemctl restart fruits
sleep 2
if systemctl is-active --quiet fruits; then
    echo "fruits.service 运行中"
else
    warn "fruits.service 未启动，最近日志："
    journalctl -u fruits -n 20 --no-pager || true
fi

log "7/9 写入 nginx 配置"
if [ -d /etc/nginx/sites-available ]; then
    sed "s|__APP_DIR__|$APP_DIR|g; s|__PORT__|$GUNICORN_PORT|g; s|__SERVER_NAME__|$SERVER_NAME|g" \
        deploy/nginx.conf > /etc/nginx/sites-available/fruits
    ln -sf /etc/nginx/sites-available/fruits /etc/nginx/sites-enabled/fruits
    rm -f /etc/nginx/sites-enabled/default
else
    sed "s|__APP_DIR__|$APP_DIR|g; s|__PORT__|$GUNICORN_PORT|g; s|__SERVER_NAME__|$SERVER_NAME|g" \
        deploy/nginx.conf > /etc/nginx/conf.d/fruits.conf
fi
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || systemctl restart nginx

log "8/9 放行本机防火墙（云服务器还需在控制台安全组放行 80）"
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=http >/dev/null && firewall-cmd --reload >/dev/null
    echo "firewalld 已放行 http"
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q active; then
    ufw allow 80/tcp >/dev/null && echo "ufw 已放行 80"
else
    echo "本机防火墙未启用或无需处理"
fi

log "9/9 自检"
echo -n "gunicorn  : "; curl -fsS "http://127.0.0.1:$GUNICORN_PORT/api/health" || echo "未就绪"
echo ""
echo -n "nginx     : "; curl -fsS "http://127.0.0.1/api/health" || echo "未就绪"
echo ""
echo -n "首页      : "; curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1/"

cat <<EOF

============================================================
部署完成
------------------------------------------------------------
PC 版      http://$SERVER_NAME/
客户端 APP http://$SERVER_NAME/m/customer/
商户端 APP http://$SERVER_NAME/m/merchant/
接口健康   http://$SERVER_NAME/api/health
Django后台 http://$SERVER_NAME/admin/

演示账号    商户 13800000000 / admin123
            会员 13900000001 / 123456

常用命令
  systemctl status fruits        # 查看后端状态
  systemctl restart fruits       # 重启后端
  journalctl -u fruits -n 50     # 看后端日志
  nginx -t && systemctl reload nginx

如果浏览器打不开，先确认云服务器「安全组」已放行 80 端口。
============================================================
EOF
