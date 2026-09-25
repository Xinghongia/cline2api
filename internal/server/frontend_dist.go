package server

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// 前端产物嵌入：`npm run build` 生成 frontend/dist 后由 Go 打进二进制。
// `all:` 前缀确保 Vite 产物中以下划线开头的文件也会被包含。
//
//go:embed all:dist
var frontendDistFS embed.FS

var frontendDistRoot = mustSubFS(frontendDistFS, "dist")

func mustSubFS(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	return sub
}

// adminStaticHandler 服务嵌入的 React SPA：
//   - /admin/ 与无扩展名的未知路径回退 index.html（前端路由）
//   - /assets/* 长缓存（Vite 产物文件名带内容哈希）
func adminStaticHandler(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/admin")
	rel = strings.TrimPrefix(rel, "/")
	if rel == "" {
		serveAdminIndex(w, r)
		return
	}
	f, err := frontendDistRoot.Open(rel)
	if err != nil {
		if !strings.Contains(path.Base(rel), ".") {
			serveAdminIndex(w, r)
			return
		}
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if info.IsDir() {
		serveAdminIndex(w, r)
		return
	}
	seeker, ok := f.(io.ReadSeeker)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if strings.HasPrefix(rel, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	http.ServeContent(w, r, info.Name(), info.ModTime(), seeker)
}

func serveAdminIndex(w http.ResponseWriter, r *http.Request) {
	f, err := frontendDistRoot.Open("index.html")
	if err != nil {
		// dist 占位（未执行 npm run build）：给出可操作的错误而非空白页
		http.Error(w, "admin frontend not built: run `npm ci && npm run build` in frontend/", http.StatusNotImplemented)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeContent(w, r, "index.html", info.ModTime(), f.(io.ReadSeeker))
}
