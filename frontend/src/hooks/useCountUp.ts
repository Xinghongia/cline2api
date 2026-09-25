import { useEffect, useRef, useState } from 'react'

/**
 * 数字滚动动画：值变化时从旧值缓动到新值。
 * prefers-reduced-motion 或非有限值时直接跳到目标。
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    const from = fromRef.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !Number.isFinite(target) || !Number.isFinite(from) || from === target) {
      fromRef.current = target
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = from + (target - from) * eased
      fromRef.current = v
      setValue(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}
