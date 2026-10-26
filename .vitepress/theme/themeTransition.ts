interface Rect {
    left: number
    top: number
    width: number
    height: number
}

interface Viewport {
    width: number
    height: number
}

export function getThemeTransitionCircle(rect: Rect, viewport: Viewport) {
    // DOM bounds and clip-path both use CSS pixels, regardless of screen density or zoom.
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    return {
        x,
        y,
        endRadius: Math.hypot(Math.max(x, viewport.width - x), Math.max(y, viewport.height - y))
    }
}
