import { useEffect, useRef } from 'react'

const TIMEOUT_MS = 15 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export function useInactivityLogout(onLogout, enabled) {
  const callbackRef = useRef(onLogout)
  callbackRef.current = onLogout

  useEffect(() => {
    if (!enabled) return

    let timer = null

    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => callbackRef.current(), TIMEOUT_MS)
    }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [enabled])
}
