"""9000 端口联调：临时后端副本和数据库，客户前端直接读取工作区。"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
root = Path(__file__).resolve().parents[3]
work = Path(tempfile.mkdtemp(prefix="fruits-customer-integration-"))
for name in ("shop", "fruitmall"):
    shutil.copytree(root / name, work / name)
sys.path.insert(0, str(work))
sys.path.insert(0, str(Path(tempfile.gettempdir()) / "fruits-interface-deps-20261101"))
os.environ["DJANGO_SETTINGS_MODULE"] = "fruitmall.settings"
sys.dont_write_bytecode = True

from django.conf import settings

settings.TEMPLATES[0]["DIRS"] = [root / "mobile", root / "frontend"]
settings.STATICFILES_DIRS = [root / "frontend/static", root / "mobile"]
settings.ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

import django
django.setup()
from django.core.management import call_command

call_command("migrate", verbosity=0)
call_command("seed", verbosity=0)
call_command("check")
print("Temporary backend and database: " + str(work), flush=True)
print("Preview: http://127.0.0.1:9000/m/customer/", flush=True)
call_command("runserver", "127.0.0.1:9000", use_reloader=False, verbosity=0)
