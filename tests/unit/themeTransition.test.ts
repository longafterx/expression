import { describe, expect, it } from 'vitest'
import { getThemeTransitionCircle } from '../../.vitepress/theme/themeTransition'

describe('getThemeTransitionCircle', () => {
    it('keeps the switch center and covering radius in CSS pixels', () => {
        expect(
            getThemeTransitionCircle({ left: 700, top: 20, width: 40, height: 24 }, { width: 1024, height: 768 })
        ).toEqual({
            x: 720,
            y: 32,
            endRadius: Math.hypot(720, 736)
        })
    })

    it('covers every viewport corner when the switch is in the mobile menu', () => {
        const viewport = { width: 390, height: 844 }
        const { x, y, endRadius } = getThemeTransitionCircle({ left: 286.5, top: 244, width: 40, height: 22 }, viewport)

        expect({ x, y }).toEqual({ x: 306.5, y: 255 })
        for (const [cornerX, cornerY] of [
            [0, 0],
            [viewport.width, 0],
            [0, viewport.height],
            [viewport.width, viewport.height]
        ]) {
            expect(Math.hypot(cornerX - x, cornerY - y)).toBeLessThanOrEqual(endRadius)
        }
    })
})
