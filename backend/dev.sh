#!/usr/bin/env bash
#
# 烛生后端服务控制 —— 启动 / 停止 / 重启 / 看日志。只管本目录的后端。
#
#   ./dev.sh start        起服务，文档在 /docs
#   ./dev.sh stop
#   ./dev.sh restart
#   ./dev.sh logs         最后 200 行
#   ./dev.sh logs -f      跟随输出
#   ./dev.sh status
#
# 只管进程，不管环境：不检测、不安装依赖。缺 .venv 时报一行原因就停。
#
# 【端口】默认 8010，不用惯例的 8000 —— 这台机器的 8000 属于另一个 FastAPI 项目。
# 覆盖方式：PORT=9000 ./dev.sh start
#
# 【监听地址】默认 0.0.0.0，局域网内可访问（后台的图片、小程序真机调试都要）。
# 只想本机可访问：HOST=127.0.0.1 ./dev.sh start
#
# 【不碰别人的进程】stop 在动手前会核对目标进程的工作目录是否在本目录内，
# 不属于本项目的一律拒绝，只打印它是谁。

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/.run"
PIDFILE="$RUN/backend.pid"
LOGFILE="$RUN/backend.log"

PORT="${PORT:-8010}"
# 绑 0.0.0.0：局域网内别的机器要能访问 —— 后台的作品缩略图由本服务直接提供
# （ASSET_BASE_URL 指向它），小程序真机调试也要连它。
# 只想本机可访问就 HOST=127.0.0.1 ./dev.sh start。
HOST="${HOST:-0.0.0.0}"
LABEL="后端 API"
ENTRY="$ROOT/.venv/bin/uvicorn"
FIX_HINT='python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"'
# 用于识别进程的特征词。注意 uvicorn --reload 真正监听端口的那个子进程，
# 命令行是 `python3 -c from multiprocessing.spawn import ...`，里面【没有
# uvicorn 这个词】—— 所以 pid_matches 还要看可执行文件路径，不能只看这个。
SIG="uvicorn"

mkdir -p "$RUN"

# ── 输出 ────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_0=$'\033[0m'
else
  C_OK=''; C_ERR=''; C_DIM=''; C_0=''
fi
ok()   { printf '%s✓%s %s\n' "$C_OK" "$C_0" "$1"; }
err()  { printf '%s✗%s %s\n' "$C_ERR" "$C_0" "$1" >&2; }
info() { printf '%s  %s%s\n' "$C_DIM" "$1" "$C_0"; }

# ── 进程查询 ────────────────────────────────────────────────────────

# pid 文件里存的是【会话 leader 的 pid，也就是进程组 id】
running_pid() {
  local pid
  [ -f "$PIDFILE" ] || return 1
  pid="$(cat "$PIDFILE" 2>/dev/null)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

# 端口是否有人在听。刻意【不带 -p】：ss 只能给出当前用户自己的进程 pid，
# 端口被别的用户占着时带 -p 会查不到，预检就会漏过去，白等半分钟才由服务
# 自己报 Address already in use。
port_listening() { ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; }

# 端口上的 pid。取不到是正常的（进程不属于当前用户），调用方要能接受空值。
port_pid() { ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1; }

pid_pgid() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '; }

# 该 pid 是否属于【本目录的后端】。两道判定都必须过：
#   1. 工作目录在本目录内 —— 挡住别的项目
#   2. 可执行文件在本目录内，或命令行含特征词
# 第 2 条要「或」，是因为上面 SIG 注释里说的那件事。
pid_matches() {
  local pid="$1" cwd argv0 argv1
  [ -r "/proc/$pid/cmdline" ] || return 1

  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" || return 1
  case "$cwd" in "$ROOT"|"$ROOT"/*) ;; *) return 1 ;; esac

  argv0="$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | sed -n 1p)"
  argv1="$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | sed -n 2p)"
  case "$argv0" in "$ROOT"/*) return 0 ;; esac
  case "$argv1" in "$ROOT"/*) return 0 ;; esac

  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q -- "$SIG"
}

# 杀掉一个进程组，先 TERM 再 KILL
kill_group() {
  local pgid="$1" waited=0
  kill -TERM -- "-$pgid" 2>/dev/null || return 1
  while [ "$waited" -lt 100 ] && kill -0 -- "-$pgid" 2>/dev/null; do
    sleep 0.1; waited=$((waited + 1))
  done
  kill -0 -- "-$pgid" 2>/dev/null && kill -KILL -- "-$pgid" 2>/dev/null
  return 0
}

# ── start ───────────────────────────────────────────────────────────
do_start() {
  local pid
  if pid="$(running_pid)"; then
    info "$LABEL 已在跑（进程组 $pid，:$PORT）"
    return 0
  fi

  # 端口被别的东西占着就停下来问，不硬抢 —— 这台机器上有别的项目在跑
  if port_listening; then
    local other; other="$(port_pid)"
    if [ -n "$other" ]; then
      err "$LABEL 起不来：:$PORT 已被 pid $other 占用"
      info "占用者：$(tr '\0' ' ' < "/proc/$other/cmdline" 2>/dev/null | cut -c1-90)"
      info "工作目录：$(readlink -f "/proc/$other/cwd" 2>/dev/null || echo '读不到')"
    else
      err "$LABEL 起不来：:$PORT 已被占用（进程属于其他用户，查不到 pid）"
    fi
    info "换端口：PORT=xxxx ./dev.sh start"
    return 1
  fi

  if [ ! -x "$ENTRY" ]; then
    err "$LABEL 起不来：找不到 $ENTRY"
    info "先装依赖：$FIX_HINT"
    return 1
  fi

  printf '\n===== %s 启动 %s :%s =====\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$LABEL" "$PORT" >> "$LOGFILE"

  rm -f "$PIDFILE"

  # 三件事都必须做，少一件就有坑：
  #
  #   1. setsid --fork —— 新开会话/进程组，stop 才能整组带走（uvicorn --reload
  #      会派生子进程，只杀父进程会留下占着端口的孤儿）。用 --fork 是因为它
  #      fork 完就【立即退出】，所以这里不加 &。
  #      不要写成 `( cd X && setsid cmd & )`：那个 & 绑定在整个 && 列表上，
  #      bash 把这一串放进后台子壳，子壳在【前台】等 setsid（已 exec 成服务
  #      进程）于是永不返回 —— dev.sh 自己卡在 wait() 里不退出，
  #      `./dev.sh start | tee x` 这类管道会永久挂住。
  #
  #   2. 进程自己写下 $$ —— 那就是新会话 leader 也就是 PGID。不能用启动侧的
  #      $!：setsid 会 fork，$! 拿到的是转瞬即逝的父进程，拿它 kill 整组会
  #      打到一个不存在的组。
  #
  #   3. 关掉继承来的 fd —— 否则服务进程一直攥着调用方的管道写端。
  ( cd "$ROOT" && _PF="$PIDFILE" setsid --fork bash -c '
      echo $$ > "$_PF"
      for _fd in /proc/$$/fd/*; do
        _n=${_fd##*/}
        [ "$_n" -gt 2 ] 2>/dev/null && eval "exec ${_n}>&-" 2>/dev/null
      done
      exec "$@"' bash \
      "$ENTRY" app.main:app --host "$HOST" --port "$PORT" --reload \
      </dev/null >> "$LOGFILE" 2>&1 )

  # 等端口真的起来，而不是「命令已提交」就报成功
  local waited=0 pgid
  while [ "$waited" -lt 300 ]; do
    if port_listening; then
      pgid="$(cat "$PIDFILE" 2>/dev/null)"
      ok "$LABEL 已启动  进程组 ${pgid:-?}  http://127.0.0.1:$PORT  （文档 /docs）"
      if [ "$HOST" = "0.0.0.0" ]; then
        local lan; lan="$(ip -4 addr show 2>/dev/null | grep -oP 'inet \K[0-9.]+' \
          | grep -vE '^(127\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -1)"
        [ -n "$lan" ] && info "局域网：http://$lan:$PORT"
      fi
      return 0
    fi
    # 已经写过 pid 又死了 —— 立刻报错，不用干等
    pgid="$(cat "$PIDFILE" 2>/dev/null)"
    if [ -n "$pgid" ] && ! kill -0 "$pgid" 2>/dev/null; then
      err "$LABEL 启动即退出，日志末尾："
      tail -n 12 "$LOGFILE" | sed 's/^/    /'
      rm -f "$PIDFILE"
      return 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done

  err "$LABEL 30 秒内没监听 :$PORT，日志末尾："
  tail -n 12 "$LOGFILE" | sed 's/^/    /'
  local half; half="$(port_pid)"
  if [ -n "$half" ] && pid_matches "$half"; then
    kill_group "$(pid_pgid "$half")" 2>/dev/null
  fi
  rm -f "$PIDFILE"
  return 1
}

# ── stop ────────────────────────────────────────────────────────────
do_stop() {
  local pgid killed=0
  if pgid="$(running_pid)"; then
    kill_group "$pgid" || kill -KILL "$pgid" 2>/dev/null
    killed=1
  fi
  rm -f "$PIDFILE"
  [ "$killed" -eq 1 ] && ok "$LABEL 已停止"

  # 兜底刻意做成【有界】的：只看那一个还占着端口的进程，确认属于本项目后
  # 连它的进程组一起带走。不要改成「pgrep 特征词」的全局清扫 —— 那样写过
  # 一版，pgrep -f 会匹配到任何命令行里提到 uvicorn 的进程，连自己一起杀。
  local orphan; orphan="$(port_pid)"
  if [ -n "$orphan" ]; then
    if pid_matches "$orphan"; then
      local opgid; opgid="$(pid_pgid "$orphan")"
      kill_group "${opgid:-$orphan}" || kill -KILL "$orphan" 2>/dev/null
      ok "$LABEL 端口残留已清（pid $orphan，进程组 ${opgid:-$orphan}）"
    else
      err ":$PORT 上的 pid $orphan 不属于本项目，没有动它"
      info "命令行：$(tr '\0' ' ' < "/proc/$orphan/cmdline" 2>/dev/null | cut -c1-90)"
      info "工作目录：$(readlink -f "/proc/$orphan/cwd" 2>/dev/null || echo '读不到')"
    fi
    return 0
  fi

  [ "$killed" -eq 0 ] && info "$LABEL 本来就没在跑"
  return 0
}

# ── status ──────────────────────────────────────────────────────────
do_status() {
  local pid
  if pid="$(running_pid)"; then
    local up; up="$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ')"
    printf '  %s在跑%s   %s  进程组 %-8s :%-6s 已运行 %s\n' \
      "$C_OK" "$C_0" "$LABEL" "$pid" "$PORT" "${up:-?}"
  elif port_listening; then
    local other; other="$(port_pid)"
    if [ -n "$other" ] && pid_matches "$other"; then
      printf '  %s在跑%s   %s  pid %-8s :%-6s %s(pid 文件已丢，脚本之外起的)%s\n' \
        "$C_OK" "$C_0" "$LABEL" "$other" "$PORT" "$C_DIM" "$C_0"
    else
      printf '  %s端口被占%s :%-6s %s\n' "$C_ERR" "$C_0" "$PORT" \
        "${other:+pid $other，}不属于本项目"
    fi
  else
    printf '  %s未运行%s   %s  :%s\n' "$C_DIM" "$C_0" "$LABEL" "$PORT"
  fi
}

# ── logs ────────────────────────────────────────────────────────────
do_logs() {
  if [ ! -f "$LOGFILE" ]; then
    err "还没有日志（$LOGFILE）"
    return 1
  fi
  if [ "${1:-0}" = "1" ]; then
    printf '%s跟随 %s，Ctrl-C 退出%s\n' "$C_DIM" "$LOGFILE" "$C_0"
    tail -n 50 -f "$LOGFILE"
  else
    tail -n 200 "$LOGFILE"
  fi
}

# ── 参数解析 ────────────────────────────────────────────────────────
usage() {
  cat <<EOF
用法：./dev.sh <命令> [-f]

  start      启动后端  :$PORT
  stop       停止
  restart    重启
  logs       看日志（默认最后 200 行，加 -f 跟随）
  status     看在不在跑

例子
  ./dev.sh start
  ./dev.sh logs -f
  PORT=9000 ./dev.sh start

pid 与日志在 .run/（已 gitignore）。只管本目录的后端；
后台前端用 ../admin/dev.sh，小程序端跑在微信开发者工具里、没有脚本。
EOF
}

cmd="${1:-}"
shift || true

follow=0
for arg in "$@"; do
  case "$arg" in
    -f|--follow) follow=1 ;;
    -h|--help) usage; exit 0 ;;
    *) err "不认识的参数：$arg"; echo; usage; exit 2 ;;
  esac
done

case "$cmd" in
  start)
    do_start || exit 1
    info "看日志：./dev.sh logs -f"
    ;;
  stop)    do_stop ;;
  restart) do_stop; echo; do_start || exit 1 ;;
  logs)    do_logs "$follow" ;;
  status)  do_status ;;
  ''|-h|--help|help) usage ;;
  *) err "不认识的命令：$cmd"; echo; usage; exit 2 ;;
esac
