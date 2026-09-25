// vite emptyOutDir 会清空产物目录；此脚本在构建后补回 .gitkeep 占位，
// 保证全新 checkout（未执行 npm build）时 go:embed 仍有文件可嵌入。
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('../../internal/server/dist/.gitkeep', import.meta.url), '')
