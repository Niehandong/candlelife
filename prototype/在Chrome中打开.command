#!/bin/zsh
# 烛生 · 一键用 Chrome 打开（无需端口、无需服务器）
# 双击本文件即可。若电脑上装有 Chrome，则用 Chrome 打开；否则用系统默认浏览器。
DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ -x "$CHROME" ]; then
  "$CHROME" "$DIR/zhusheng-sleep-figma.html" "$DIR/zhusheng-admin.html" >/dev/null 2>&1 &
else
  open "$DIR/zhusheng-sleep-figma.html"
  open "$DIR/zhusheng-admin.html"
fi
