"""把移动端 H5 资源导出到 Android 工程的 assets 目录（无需第三方依赖）。

用法：
    python android/export_web.py                # 同时导出客户端与商户端
    python android/export_web.py customer       # 只导出客户端
    python android/export_web.py merchant       # 只导出商户端

做的事情：
    1. 清空 android/app/src/<flavor>/assets/www/
    2. 把 mobile/<flavor>/index.html 里的 Django 模板标签去掉
       （{% load static %} 删除，{% static 'x' %} 替换为相对路径 x）
    3. 按静态资源路径 1:1 复制到 www/，保证 index.html 里的相对路径能命中：
         www/index.html           ← mobile/<flavor>/index.html
         www/<flavor>/app.js|css  ← mobile/<flavor>/
         www/shared/*             ← mobile/shared/
         www/vendor/vue.global.prod.js ← frontend/static/vendor/
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANDROID = ROOT / "android"

APPS = {
    "customer": ROOT / "mobile" / "customer",
    "merchant": ROOT / "mobile" / "merchant",
}

STATIC_TAG = re.compile(r"\{%\s*static\s+'([^']+)'\s*%\}")
LOAD_TAG = re.compile(r"\{%\s*load\s+static\s*%\}")


def export(flavor: str) -> None:
    src = APPS[flavor]
    if not src.is_dir():
        raise SystemExit(f"找不到 {src}")

    www = ANDROID / "app" / "src" / flavor / "assets" / "www"
    if www.exists():
        shutil.rmtree(www)
    (www / flavor).mkdir(parents=True)
    (www / "shared").mkdir()
    (www / "vendor").mkdir()

    html = (src / "index.html").read_text(encoding="utf-8")
    html = LOAD_TAG.sub("", html)
    html = STATIC_TAG.sub(lambda m: m.group(1), html)
    if "{%" in html:
        raise SystemExit("index.html 里还有未处理的模板标签，请检查")
    (www / "index.html").write_text(html, encoding="utf-8")

    for name in ("app.js", "app.css"):
        target = src / name
        if target.exists():
            shutil.copy2(target, www / flavor / name)

    shutil.copytree(ROOT / "mobile" / "shared", www / "shared", dirs_exist_ok=True)
    shutil.copy2(
        ROOT / "frontend" / "static" / "vendor" / "vue.global.prod.js",
        www / "vendor" / "vue.global.prod.js",
    )

    total = 0
    print(f"[{flavor}] -> {www}")
    for path in sorted(www.rglob("*")):
        if path.is_file():
            size = path.stat().st_size
            total += size
            print(f"    {path.relative_to(www)!s:<34} {size / 1024:>7.1f} KB")
    print(f"    合计 {total / 1024:.1f} KB")


def main() -> None:
    targets = sys.argv[1:] or list(APPS)
    for flavor in targets:
        if flavor not in APPS:
            raise SystemExit(f"未知的 flavor：{flavor}（可选：{'、'.join(APPS)}）")
        export(flavor)
    print("\n导出完成。接下来用 Android Studio 打开 android/ 目录，")
    print("或执行：cd android && gradlew assembleCustomerDebug assembleMerchantDebug")


if __name__ == "__main__":
    main()
