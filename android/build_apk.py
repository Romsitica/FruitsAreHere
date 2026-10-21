"""不依赖 Gradle 直接打包 APK —— 只用 Android SDK 的 build-tools + JDK 17。

用法：
    python android/build_apk.py                       # 打包客户端 + 商户端
    python android/build_apk.py customer              # 只打客户端
    python android/build_apk.py merchant --api http://10.111.216.154:8000/api
    python android/build_apk.py --sdk "D:/Android/JDK"

流程（每一步都是 Android 官方工具）：
    1. export_web.py 把 H5 导出到 assets
    2. aapt2 compile  编译 res/ 资源
    3. aapt2 link     链接资源 + 生成 R.java，同时产出只含资源的 APK 骨架
    4. 生成 BuildConfig.java（Gradle 才会自动生成的东西，这里手写）
    5. javac          编译 Java 源码
    6. d8             把 class 转成 classes.dex
    7. 把 classes.dex 与 assets/ 塞进 APK
    8. zipalign       4 字节对齐
    9. apksigner      用调试证书签名（首次运行自动生成 keystore）

产物：android/dist/<flavor>/app-<flavor>-debug.apk


axaax
"""
import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ANDROID = Path(__file__).resolve().parent
ROOT = ANDROID.parent

FLAVORS = {
    "customer": {
        "applicationId": "com.fruitsarehere.customer",
        "label": "果子来了",
        "apiProp": "customerApiBase",
    },
    "merchant": {
        "applicationId": "com.fruitsarehere.merchant",
        "label": "果子来了商户",
        "apiProp": "merchantApiBase",
    },
}

MIN_SDK = 26
TARGET_SDK = 34
VERSION_CODE = 1
VERSION_NAME = "1.0.0"

KEYSTORE = ANDROID / "build" / "debug.keystore"
KS_ALIAS = "androiddebugkey"
KS_PASS = "android"


# ------------------------------------------------------------------ 基础工具
def run(args, cwd=None):
    args = [str(a) for a in args]
    if args[0].lower().endswith((".bat", ".cmd")):
        args = [os.environ.get("COMSPEC", "cmd.exe"), "/c"] + args
    proc = subprocess.run(
        args, cwd=str(cwd) if cwd else None,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if proc.returncode != 0:
        raise SystemExit(
            "命令执行失败：\n  " + " ".join(args)
            + f"\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
        )
    return proc.stdout


def find_sdk(explicit):
    """定位 Android SDK 根目录（含 platforms 与 build-tools 的目录）。"""
    candidates = []
    if explicit:
        candidates.append(explicit)
    local_props = ANDROID / "local.properties"
    if local_props.exists():
        for line in local_props.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("sdk.dir="):
                candidates.append(line.split("=", 1)[1].strip().replace("\\\\", "/").replace("\\", "/"))
    for env in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
        if os.environ.get(env):
            candidates.append(os.environ[env])
    home = Path(os.path.expanduser("~"))
    candidates += [
        "D:/Android/JDK",          # 本机实测路径（文件夹名叫 JDK，其实是 SDK）
        "D:/Android/Sdk",
        "C:/Android/Sdk",
        home / "AppData/Local/Android/Sdk",
    ]
    for item in candidates:
        path = Path(item)
        if (path / "platforms").is_dir() and (path / "build-tools").is_dir():
            return path
    raise SystemExit(
        "没找到 Android SDK。请设置环境变量 ANDROID_HOME，"
        "或在 android/local.properties 里写 sdk.dir=你的SDK路径，"
        "或用 --sdk 指定。"
    )


def find_build_tools(sdk):
    root = sdk / "build-tools"
    versions = [p for p in root.iterdir() if (p / "aapt2.exe").exists() or (p / "aapt2").exists()]
    if not versions:
        raise SystemExit(f"{root} 下没有可用的 build-tools（缺 aapt2）")
    versions.sort(key=lambda p: [int(n) for n in re.findall(r"\d+", p.name)] or [0])
    return versions[-1]


def find_platform(sdk):
    root = sdk / "platforms"
    platforms = [p for p in root.iterdir() if (p / "android.jar").exists()]
    if not platforms:
        raise SystemExit(f"{root} 下没有安装任何 platform（缺 android.jar）")
    platforms.sort(key=lambda p: [int(n) for n in re.findall(r"\d+", p.name)] or [0])
    return platforms[-1]


def find_jdk():
    java_home = os.environ.get("JAVA_HOME")
    if java_home and (Path(java_home) / "bin" / "javac.exe").exists():
        return Path(java_home)
    which = shutil.which("javac")
    if which:
        return Path(which).parent.parent
    for guess in ("D:/JDK 17", "D:/Android/Android Studio/jbr"):
        if (Path(guess) / "bin" / "javac.exe").exists():
            return Path(guess)
    raise SystemExit("没找到 JDK（需要 javac）。请设置 JAVA_HOME。")


def read_api_base(flavor, override):
    if override:
        return override
    props = ANDROID / "gradle.properties"
    key = FLAVORS[flavor]["apiProp"]
    if props.exists():
        for line in props.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return ""


# ------------------------------------------------------------------ 打包主流程
def build(flavor, sdk, bt, platform, jdk, api_base):
    conf = FLAVORS[flavor]
    app_id = conf["applicationId"]
    namespace = "com.fruitsarehere.shell"

    work = ANDROID / "build" / "apk" / flavor
    if work.exists():
        shutil.rmtree(work)
    (work / "gen").mkdir(parents=True)
    (work / "classes").mkdir()
    (work / "dex").mkdir()

    env = dict(os.environ)
    env["JAVA_HOME"] = str(jdk)
    # 让 javac / d8 / apksigner 的输出用 UTF-8，避免中文报错乱码
    env["JAVA_TOOL_OPTIONS"] = "-Dfile.encoding=UTF-8"
    os.environ.update({"JAVA_HOME": str(jdk), "JAVA_TOOL_OPTIONS": "-Dfile.encoding=UTF-8"})

    print(f"\n=== 打包 {flavor}（{app_id}） ===")
    print(f"  SDK          {sdk}")
    print(f"  build-tools  {bt.name}")
    print(f"  platform     {platform.name}")
    print(f"  JDK          {jdk}")
    print(f"  后端地址     {api_base or '(未配置)'}")
    if not api_base:
        print("  ⚠ 未配置后端地址：APP 打开后无法连接接口。")
        print("    请在 android/gradle.properties 里填 <flavor>ApiBase，或用 --api 指定。")

    # 1. 导出 H5 资源到 assets
    sys.path.insert(0, str(ANDROID))
    import export_web  # noqa: E402
    export_web.export(flavor)

    assets_dir = ANDROID / "app" / "src" / flavor / "assets"
    if not (assets_dir / "www" / "index.html").exists():
        raise SystemExit("assets 导出失败")

    # 2. 生成带 package 属性的清单（aapt2 需要）
    raw_manifest = (ANDROID / "app" / "src" / "main" / "AndroidManifest.xml").read_text(encoding="utf-8")
    if "package=" not in raw_manifest:
        raw_manifest = re.sub(r"<manifest\b([^>]*)>", r'<manifest\1 package="' + app_id + '">',
                              raw_manifest, count=1)
    manifest = work / "AndroidManifest.xml"
    manifest.write_text(raw_manifest, encoding="utf-8")

    # 3. 生成 flavor 专属资源（应用名，等价于 Gradle 的 resValue）
    flavor_res = work / "res-flavor" / "values"
    flavor_res.mkdir(parents=True)
    (flavor_res / "flavor.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <string name="app_name">{conf["label"]}</string>\n</resources>\n',
        encoding="utf-8",
    )

    aapt2 = bt / "aapt2.exe"
    d8 = bt / "d8.bat"
    zipalign = bt / "zipalign.exe"
    apksigner = bt / "apksigner.bat"
    android_jar = platform / "android.jar"

    # 4. aapt2 compile
    print("\n[1/7] aapt2 compile 编译资源")
    run([aapt2, "compile", "--dir", ANDROID / "app" / "src" / "main" / "res", "-o", work / "res-main.zip"], cwd=ANDROID)
    run([aapt2, "compile", "--dir", work / "res-flavor", "-o", work / "res-flavor.zip"], cwd=ANDROID)

    # 5. aapt2 link（产出资源骨架 APK + R.java）
    print("[2/7] aapt2 link 链接资源")
    base_apk = work / "base.apk"
    run([
        aapt2, "link",
        "-o", base_apk,
        "-I", android_jar,
        "--manifest", manifest,
        "-R", work / "res-main.zip",
        "-R", work / "res-flavor.zip",
        "--auto-add-overlay",   # 多个 -R 输入时 aapt2 按 overlay 处理，必须显式允许新增资源
        # R.java 生成到 namespace 包下，与 MainActivity 同包，等价于 Gradle 的行为
        "--custom-package", namespace,
        "--java", work / "gen",
        "--min-sdk-version", MIN_SDK,
        "--target-sdk-version", TARGET_SDK,
        "--version-code", VERSION_CODE,
        "--version-name", VERSION_NAME,
    ], cwd=ANDROID)

    # 6. 手写 BuildConfig（Gradle 的活，这里自己生成）
    gen_pkg = work / "gen" / Path(*namespace.split("."))
    gen_pkg.mkdir(parents=True, exist_ok=True)
    (gen_pkg / "BuildConfig.java").write_text(
        f"package {namespace};\n\n"
        "public final class BuildConfig {\n"
        "    public static final boolean DEBUG = Boolean.parseBoolean(\"true\");\n"
        f"    public static final String API_BASE = \"{api_base}\";\n"
        "}\n",
        encoding="utf-8",
    )

    # 7. javac 编译
    print("[3/7] javac 编译 Java 源码")
    sources = sorted(str(p) for p in (work / "gen").rglob("*.java"))
    sources += sorted(str(p) for p in (ANDROID / "app" / "src" / "main" / "java").rglob("*.java"))
    run([
        jdk / "bin" / "javac.exe",
        "-encoding", "UTF-8", "-nowarn",
        "-source", "8", "-target", "8",
        "-bootclasspath", android_jar,
        "-d", work / "classes",
        *sources,
    ], cwd=ANDROID)

    # 8. d8 生成 dex
    print("[4/7] d8 生成 classes.dex")
    run([jdk / "bin" / "jar.exe", "cf", work / "classes.jar", "-C", work / "classes", "."], cwd=ANDROID)
    run([d8, "--release", "--lib", android_jar, "--min-api", MIN_SDK,
         "--output", work / "dex", work / "classes.jar"], cwd=ANDROID)
    dex = work / "dex" / "classes.dex"
    if not dex.exists():
        raise SystemExit("d8 没有产出 classes.dex")

    # 9. 合并 dex + assets
    print("[4/7] 合并 classes.dex 与 assets")
    unsigned = work / "unsigned.apk"
    shutil.copy2(base_apk, unsigned)
    with zipfile.ZipFile(unsigned, "a", zipfile.ZIP_DEFLATED) as zf:
        zf.write(dex, "classes.dex")
        for path in sorted((assets_dir / "www").rglob("*")):
            if path.is_file():
                zf.write(path, "assets/" + path.relative_to(assets_dir).as_posix())

    # 10. zipalign
    print("[5/7] zipalign 对齐")
    aligned = work / "aligned.apk"
    run([zipalign, "-f", "-p", "4", unsigned, aligned], cwd=ANDROID)

    # 11. 调试签名
    print("[6/7] apksigner 签名")
    if not KEYSTORE.exists():
        KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
        run([
            jdk / "bin" / "keytool.exe", "-genkeypair", "-v",
            "-keystore", KEYSTORE, "-storepass", KS_PASS, "-keypass", KS_PASS,
            "-alias", KS_ALIAS, "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
            "-dname", "CN=Android Debug,O=Android,C=US",
        ], cwd=ANDROID)
        print(f"      已生成调试证书 {KEYSTORE}")

    dist = ANDROID / "dist" / flavor
    dist.mkdir(parents=True, exist_ok=True)
    final_apk = dist / f"app-{flavor}-debug.apk"
    if final_apk.exists():
        final_apk.unlink()
    run([apksigner, "sign", "--ks", KEYSTORE, "--ks-key-alias", KS_ALIAS,
         "--ks-pass", f"pass:{KS_PASS}", "--key-pass", f"pass:{KS_PASS}",
         "--out", final_apk, aligned], cwd=ANDROID)

    # 12. 校验
    print("[7/7] 校验签名")
    out = run([apksigner, "verify", "--verbose", final_apk], cwd=ANDROID)
    if "Verifies" not in out and "verified" not in out.lower():
        raise SystemExit("签名校验未通过：\n" + out)

    size_mb = final_apk.stat().st_size / 1024 / 1024
    print(f"\nAPK 生成成功：{final_apk}  ({size_mb:.2f} MB)")
    print(f"  内含资源指纹 md5 = {hashlib.md5(final_apk.read_bytes()).hexdigest()[:12]}")
    return final_apk


def main():
    parser = argparse.ArgumentParser(description="不依赖 Gradle 打包 APK")
    parser.add_argument("flavors", nargs="*", default=[], help="customer / merchant，默认两个都打")
    parser.add_argument("--sdk", help="Android SDK 根目录")
    parser.add_argument("--api", help="后端地址，如 http://10.0.0.5:8000/api（默认读 gradle.properties）")
    args = parser.parse_args()

    targets = args.flavors or list(FLAVORS)
    for flavor in targets:
        if flavor not in FLAVORS:
            raise SystemExit(f"未知 flavor：{flavor}")

    sdk = find_sdk(args.sdk)
    bt = find_build_tools(sdk)
    platform = find_platform(sdk)
    jdk = find_jdk()

    results = []
    for flavor in targets:
        api_base = read_api_base(flavor, args.api)
        results.append(build(flavor, sdk, bt, platform, jdk, api_base))

    print("\n================ 全部完成 ================")
    for apk in results:
        print(f"  {apk}")
    print("\n安装到手机（USB 调试已打开）：")
    for apk in results:
        print(f'  "{sdk / "platform-tools" / "adb.exe"}" install -r "{apk}"')


if __name__ == "__main__":
    main()
