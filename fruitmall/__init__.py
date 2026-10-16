"""果子来了 · fruitmall 项目包。

这里做一件"上服务器才不会踩坑"的事：SQLite 版本兜底。

Django 5 要求 SQLite >= 3.31，而 Alibaba Cloud Linux 3 / CentOS 8 自带的
libsqlite3 只有 3.26，直接跑会报：
    django.db.utils.NotSupportedError: SQLite 3.31 or later is required (found 3.26.0)

服务器上装有 pysqlite3-binary（自带新版 SQLite，见 deploy/requirements-prod.txt）时，
把标准库的 sqlite3 模块替换掉即可，无需动系统库。
本地开发（Windows / macOS 的 Python 自带 SQLite 都很新）不会走到这个分支。
"""
import sqlite3 as _sqlite3
import sys as _sys

if _sqlite3.sqlite_version_info < (3, 31):
    try:
        import pysqlite3 as _pysqlite3

        _sys.modules["sqlite3"] = _pysqlite3
    except ImportError:  # 没装就打回原形，让 Django 自己报版本错误
        pass
