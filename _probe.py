import io
import os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "miniprogram", "dist")

wxss = io.open(os.path.join(D, "common.wxss"), encoding="utf-8").read()
js = io.open(os.path.join(D, "common.js"), encoding="utf-8").read()

print("=== common.wxss ===")
print(wxss)
print()
print("still 规则中的通配选择器:", "有" if "still *" in wxss else "无 (已修复)")
print()
print("=== 引导路由守卫 ===")
for s in ["pages/welcome/index", "pages/guide/index", "pages/story/index", "getCurrentPages"]:
    print("  %-22s in common.js: %s" % (s, s in js))
