// 管理 API 统一封装：所有响应都是 {success, data?, error?, message?} envelope。
// 401 时派发全局事件，由外层弹出登录框/跳转登录页。

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const UNAUTHORIZED_EVENT = 'c2a:unauthorized'

interface Envelope<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`/admin/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (resp.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    throw new ApiError(401, 'unauthorized')
  }
  let payload: Envelope<T>
  try {
    payload = (await resp.json()) as Envelope<T>
  } catch {
    throw new ApiError(resp.status, `HTTP ${resp.status}`)
  }
  if (!resp.ok || !payload.success) {
    throw new ApiError(resp.status, payload.error || payload.message || `HTTP ${resp.status}`)
  }
  return payload.data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
}
