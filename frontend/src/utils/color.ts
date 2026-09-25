/**
 * oklch() → sRGB 字符串换算。
 * ECharts(zrender) 与旧版 canvas fillStyle 都解析不了 oklch，
 * 而 getComputedStyle 对自定义属性只会原样返回 oklch 字符串，所以手动换算。
 */
export function oklchToRgb(l: number, c: number, hDeg: number, alpha = 1): string {
  // 百分比亮度归一到 0-1
  const L = l > 1 ? l / 100 : l
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  // OKLab → LMS'
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l3 = l_ * l_ * l_
  const m3 = m_ * m_ * m_
  const s3 = s_ * s_ * s_

  // LMS' → 线性 sRGB
  let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  let bb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  // 线性 → 伽马编码
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
  r = clamp01(gamma(r))
  g = clamp01(gamma(g))
  bb = clamp01(gamma(bb))

  const to8 = (x: number) => Math.round(x * 255)
  return alpha >= 1
    ? `rgb(${to8(r)}, ${to8(g)}, ${to8(bb)})`
    : `rgba(${to8(r)}, ${to8(g)}, ${to8(bb)}, ${alpha})`
}

/** 解析 tokens.css 里的 oklch() 声明（如 `oklch(91% .006 278)` 或带 `/ 0.4` 透明度） */
export function cssColorToRgb(css: string, alphaOverride?: number): string {
  const m = css.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)/)
  if (!m) return css
  const l = parseFloat(m[1])
  const c = parseFloat(m[2])
  const h = parseFloat(m[3])
  let alpha = 1
  if (alphaOverride !== undefined) alpha = alphaOverride
  else if (m[4]) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  return oklchToRgb(l, c, h, alpha)
}
