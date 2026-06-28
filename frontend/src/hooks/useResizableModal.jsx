import { useCallback, useState } from 'react'

export function useResizableModal({
  defaultWidth = 520,
  defaultHeight = 420,
  minWidth = 360,
  minHeight = 240,
} = {}) {
  const [modalWidth, setModalWidth] = useState(defaultWidth)
  const [bodyHeight, setBodyHeight] = useState(defaultHeight)

  const resetSize = useCallback(() => {
    const w = Math.max(minWidth, Math.min(Math.round(window.innerWidth * 0.78), defaultWidth))
    const h = Math.max(minHeight, Math.min(Math.round(window.innerHeight * 0.62), defaultHeight))
    setModalWidth(w)
    setBodyHeight(h)
  }, [defaultWidth, defaultHeight, minWidth, minHeight])

  return { modalWidth, bodyHeight, resetSize }
}
