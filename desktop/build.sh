#!/usr/bin/env sh
# 构建当前平台的单文件桌面版。
# Wails 依赖各平台原生 WebView（C 绑定），不能交叉编译，
# 需要在每个目标系统上分别运行此脚本。
#
# 各平台前置依赖：
#   Windows: WebView2 运行时（Win10/11 自带）
#   macOS:   Xcode Command Line Tools (xcode-select --install)
#   Linux:   GTK3 + WebKit2GTK，例如：
#            Debian/Ubuntu: sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev
#            Fedora:        sudo dnf install gtk3-devel webkit2gtk4.1-devel
#            Arch:          sudo pacman -S gtk3 webkit2gtk
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OS=$(go env GOOS)
ARCH=$(go env GOARCH)
OUT="$ROOT/desktop/build/$OS-$ARCH"
NAME="cline-proxy-desktop"
# 版本号：优先环境变量 VERSION，否则取最近 git tag（如 v1.3.0），再退回 dev
VERSION=${VERSION:-$(git describe --tags --always 2>/dev/null || echo "dev")}
LDFLAGS="-s -w -X main.appVersion=$VERSION"

if [ "$OS" = "windows" ]; then
  NAME="$NAME.exe"
  # GUI 子系统，双击不弹黑色控制台窗口
  LDFLAGS="$LDFLAGS -H windowsgui"
fi

mkdir -p "$OUT"
cd "$ROOT"

# 前端产物（go:embed all:frontend/dist）必须先于 go build 生成
if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "Building admin frontend..."
  if command -v npm >/dev/null 2>&1; then
    (cd "$ROOT/frontend" && (npm ci --no-fund --no-audit || npm install --no-fund --no-audit) && npm run build)
  else
    echo "ERROR: frontend/dist 不存在且未安装 npm，无法构建内嵌管理后台。" >&2
    echo "请先安装 Node.js 22+ 并重试，或在已装 Node 的机器上执行: cd frontend && npm ci && npm run build" >&2
    exit 1
  fi
fi

go build -tags "desktop production" -trimpath -ldflags="$LDFLAGS" -o "$OUT/$NAME" .
printf 'Built: %s (version %s)\n' "$OUT/$NAME" "$VERSION"
