import io
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

files = [
    "miniprogram/project.config.json",
    "miniprogram/project.private.config.json",
]

for rel in files:
    p = os.path.join(ROOT, rel)
    try:
        d = json.load(io.open(p, encoding="utf-8"))
        print("JSON OK   %-42s appid=%s" % (rel, d.get("appid")))
    except Exception as e:
        print("JSON FAIL %-42s %s" % (rel, e))
