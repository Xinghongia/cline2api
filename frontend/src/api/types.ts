// 与后端 admin.go 返回结构一一对应的类型定义（字段名以真实 API 响应为准）

export interface ModelStat {
  modelId?: string
  cost?: string
  usageCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
}

export interface Account {
  accountId: string
  email: string
  refreshToken?: string
  status: 'active' | 'cooldown' | 'expired' | string
  cooldownUntil?: string
  lastUsed?: string
  usageCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  createdAt?: string
  modelStats?: Record<string, ModelStat>
  modelCooldowns?: Record<string, string>
}

export interface AccountsResp {
  accounts: Account[]
  total: number
  poolIndex: number
}

export interface AccountTestResult {
  accountId: string
  email: string
  ok: boolean
  durationMs: number
  inputTokens: number
  outputTokens: number
  error?: string
}

export interface BatchImportResult {
  imported: number
  failed: number
  duplicates: number
  errors?: string[]
}

export interface OAuthStart {
  sessionId: string
  verificationUri: string
  userCode: string
}

export interface OAuthStatus {
  done: boolean
  success: boolean
  email?: string
  error?: string
}

export interface AdminModel {
  id: string
  provider?: string
  cost?: string
  status?: string
  custom?: boolean
  source?: string
  context?: number
  output?: number
  metaLocked?: boolean
}

export interface ModelSyncResult {
  changed: boolean
  added: string[] | null
  removed: string[] | null
  syncedAt: string
  total: number
  error?: string
}

export interface ModelsResp {
  models: AdminModel[]
  lastSync: ModelSyncResult
}

export interface AdminConfig {
  address: string
  host: string
  strategy: string
  modelChain: string[] | null
  zenHeaders?: Record<string, string> | null
  poolPath: string
  defaultModel: string
  headers: Record<string, string>
  onlyFree: boolean
  localIPs: string[]
  hasPassword: boolean
  version: string
}

export interface StatsResp {
  total: number
  active: number
  cooldown: number
  expired: number
  usageCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  strategy: string
  modelChain: string[] | null
  version: string
  opencodeToday: {
    requests: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface RequestLog {
  id: string
  startedAt: string
  finishedAt?: string
  accountId?: string
  accountEmail?: string
  protocol?: string
  upstream?: string
  apiKeyId?: string
  providerId?: string
  model?: string
  stream?: boolean
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
  usageAvailable?: boolean
  durationMs: number
  ttftMs?: number
  outputTokensPerSecond?: number
  completed: boolean
  error?: string
  errorClass?: string
}

export interface LogPage {
  items: RequestLog[]
  nextCursor: string
  hasMore: boolean
}

export interface CustomProvider {
  id: string
  name: string
  baseURL: string
  apiKey: string
  modelIds: string[]
  headers?: Record<string, string>
  enabled: boolean
  priority: number
  timeoutSec?: number
  free: boolean
  createdAt?: string
}

export interface ProviderPreset {
  key: string
  name: string
  baseURL: string
  headers?: Record<string, string>
  notes?: string
  freeTier?: boolean
}

export interface ProviderTestResult {
  ok: boolean
  error?: string
  durationMs: number
  model?: string
  inputTokens?: number
  outputTokens?: number
}

export interface OpencodeConfig {
  enabled: boolean
  key: string
  baseURL: string
  proxies: string[]
  proxyStrategy: string
  proxyCooldowns?: Record<string, string>
  maxConcurrency: number
  retries: number
  failover: boolean
  failoverCount: number
  failoverMinutes: number
  zenHeaders?: Record<string, string> | null
  compaction: {
    auto: boolean
    buffer: number
    keepTokens: number
    summaryModel: string
    maxSummary: number
  }
  runtime?: { failoverActive: boolean }
  syncedModels?: number
  lastSync?: ModelSyncResult
}

export interface ClineProxyConfig {
  proxies: string[]
  proxyStrategy: string
}

export interface APIKey {
  key: string
  name?: string
  enabled: boolean
  createdAt?: string
  lastUsedAt?: string
  totalRequests?: number
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  totalTokens?: number
}

export interface SeriesPoint {
  t: number
  r: number
  in: number
  out: number
  cached: number
  total: number
}

export interface SeriesGroup {
  name: string
  points: SeriesPoint[]
}

export interface SeriesResp {
  bucket: string
  from: number
  to: number
  groups: SeriesGroup[]
}

export interface NamedUsage {
  name: string
  requests: number
  totalTokens: number
}

export interface Totals {
  requests: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
}

export interface SummaryResp {
  range: string
  totals: Totals
  topModels: NamedUsage[]
  upstreams: NamedUsage[]
  topKeys: NamedUsage[]
}
