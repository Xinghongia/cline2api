import { message } from 'antd'

/** 千分位格式化（token 用量等大数字） */
export function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null) return '-'
  return new Intl.NumberFormat('en-US').format(n)
}

/** 相对冷却/使用时间的简短展示 */
export function fmtTime(iso: string | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 复制文本到剪贴板并提示 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    void message.success('已复制')
  } catch {
    // 剪贴板 API 不可用（如非安全上下文）时退回 execCommand
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    void message.success('已复制')
  }
}

/**
 * 打开外部链接：统一走后端 open-external，由服务端调起系统浏览器。
 * 不要用 window.open 再兜底后端——noopener 模式下 window.open 恒返回 null，
 * 会被误判为弹窗被拦截，导致浏览器标签页 + 系统浏览器各开一次（双链接 bug）。
 * 桌面 WebView 本就无法弹外部浏览器，本机浏览器场景下两端同机，服务端打开即一次。
 */
export function openExternal(url: string): void {
  void fetch(`/admin/api/open-external?url=${encodeURIComponent(url)}`)
}

/** 把多行文本解析为批量导入 tokens：优先 JSON 数组，否则每行一个 token */
export function parseTokenLines(text: string): { refreshToken: string; email?: string }[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') return { refreshToken: item.trim() }
          const obj = item as { refreshToken?: string; email?: string }
          return { refreshToken: String(obj.refreshToken ?? '').trim(), email: obj.email?.trim() || undefined }
        })
        .filter((t) => t.refreshToken !== '')
    }
  } catch {
    // 非 JSON，按行解析
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => ({ refreshToken: line }))
}
