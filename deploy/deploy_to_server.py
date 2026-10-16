"""把本机代码部署到服务器（Windows 上运行）。

用法：
    python deploy/deploy_to_server.py --password <root密码>
    python deploy/deploy_to_server.py --password <root密码> --check     # 只看服务器状态
    python deploy/deploy_to_server.py --key ~/.ssh/fruits_deploy        # 用密钥登录
    python deploy/deploy_to_server.py --host 47.102.132.175 --app-dir /opt/fruits --password <>

做的事（--check 时只做第 4 步）：
    1. 打包本机代码（排除 .venv / data / staticfiles / cmdline-tools / android 构建产物）
    2. SFTP 上传到 /tmp 并解压到 APP_DIR
    3. 远程执行 deploy/bootstrap.sh（装依赖 → 建库 → 收集静态 → 重启服务）
    4. 自检各入口状态

依赖：pip install paramiko
密码建议用环境变量传入，避免留在命令历史里：
    $env:FRUITS_SSH_PASSWORD="xxx"; python deploy/deploy_to_server.py
"""
import argparse
import os
import sys
import tarfile
import tempfile
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    raise SystemExit("需要 paramiko：pip install paramiko")

REPO = Path(__file__).resolve().parent.parent

EXCLUDE_NAMES = {
    ".venv", "venv", "data", "staticfiles", ".git", "__pycache__",
    "cmdline-tools", "build", "dist", "assets", ".idea", ".gradle", "node_modules",
}

CHECK_CMD = r"""
echo "--- 服务状态 ---"; systemctl is-active fruits nginx
echo "--- 监听端口 ---"; ss -lntp 2>/dev/null | grep -E ':80 |:8001 ' | awk '{print $4}'
echo "--- 部署目录 ---"; du -sh /opt/fruits | cut -f1; ls -1 /opt/fruits/data/
echo "--- 环境变量（已脱敏） ---"; sed -E 's/^(DJANGO_SECRET_KEY=).*/\1***/' /opt/fruits/deploy/.env
echo "--- 各入口 HTTP 状态 ---"
for u in /api/health / /m/customer/ /m/merchant/ /static/shared/api.js /admin/; do
  printf '%-28s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1$u)"
done
echo "--- 版本 ---"; /opt/fruits/.venv/bin/python -c 'import django,sqlite3;print("Django",django.get_version(),"| SQLite",sqlite3.sqlite_version)'
echo "--- 数据量 ---"; /opt/fruits/.venv/bin/python /opt/fruits/manage.py shell -c "from shop.models import *;print('会员',User.objects.count(),'商品',Product.objects.count(),'订单',Order.objects.count(),'奖品',Prize.objects.count())"
echo "--- 最近日志 ---"; journalctl -u fruits -n 5 --no-pager | tail -5
"""


def connect(host, user, password=None, key=None):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs = {"username": user, "timeout": 20, "banner_timeout": 30}
    if key:
        kwargs["key_filename"] = os.path.expanduser(key)
    else:
        kwargs["password"] = password
    client.connect(host, **kwargs)
    return client


def run(client, cmd, timeout=2400, echo=True):
    chan = client.get_transport().open_session()
    chan.exec_command(cmd)
    chan.settimeout(0.0)
    deadline = time.time() + timeout
    while True:
        read = False
        while chan.recv_ready():
            data = chan.recv(8192)
            if not data:
                break
            read = True
            if echo:
                sys.stdout.write(data.decode("utf-8", "replace"))
                sys.stdout.flush()
        while chan.recv_stderr_ready():
            data = chan.recv_stderr(8192)
            if echo and data:
                sys.stdout.write(data.decode("utf-8", "replace"))
                sys.stdout.flush()
        if chan.exit_status_ready() and not chan.recv_ready():
            break
        if time.time() > deadline:
            print("\n[!] 超时")
            break
        if not read:
            time.sleep(0.2)
    return chan.recv_exit_status()


def make_tarball():
    path = Path(tempfile.gettempdir()) / "fruits_deploy.tar.gz"

    def flt(ti):
        name = os.path.basename(ti.name)
        if name in EXCLUDE_NAMES or name.endswith((".pyc", ".apk", ".keystore", ".jks")):
            return None
        return ti

    with tarfile.open(path, "w:gz") as tar:
        tar.add(REPO, arcname=".", filter=flt)
    print(f"打包完成 {path.name}（{path.stat().st_size / 1024:.0f} KB）")
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="47.102.132.175")
    ap.add_argument("--user", default="root")
    ap.add_argument("--password", default=os.environ.get("FRUITS_SSH_PASSWORD"))
    ap.add_argument("--key", help="私钥路径（优先于密码）")
    ap.add_argument("--app-dir", default="/opt/fruits")
    ap.add_argument("--check", action="store_true", help="只检查服务器状态，不部署")
    args = ap.parse_args()

    if not args.key and not args.password:
        raise SystemExit("请用 --password 或 --key 提供登录凭据（也可设 FRUITS_SSH_PASSWORD 环境变量）")

    print(f"连接 {args.user}@{args.host} …")
    client = connect(args.host, args.user, args.password, args.key)
    print("登录成功 ✓")

    if args.check:
        run(client, CHECK_CMD)
        client.close()
        return 0

    tar = make_tarball()
    dirs = f"{REPO}/deploy"

    print(f"\n上传并解压到 {args.app_dir} …")
    sftp = client.open_sftp()
    sftp.put(str(tar), "/tmp/fruits_deploy.tar.gz")
    sftp.close()
    if run(client, f"mkdir -p {args.app_dir} && tar -xzf /tmp/fruits_deploy.tar.gz -C {args.app_dir}"):
        raise SystemExit("解压失败")

    print("\n执行 deploy/bootstrap.sh …")
    code = run(client, f"cd {args.app_dir} && bash deploy/bootstrap.sh 2>&1")
    if code:
        print(f"[!] bootstrap.sh 退出码 {code}")

    print("\n最终状态：")
    run(client, CHECK_CMD)
    client.close()
    print(f"\n完成。入口： http://{args.host}/  |  /m/customer/  |  /m/merchant/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
