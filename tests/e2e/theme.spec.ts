import { test, expect, type Page } from '@playwright/test'

type ThemeAnimationEffect = typeof window.KeyframeEffect.prototype

async function pauseThemeAnimation(page: Page) {
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const animation = document.getAnimations().find((animation) => {
                        const effect = animation.effect as ThemeAnimationEffect | null
                        return effect?.pseudoElement?.match(/^::view-transition-(old|new)\(root\)$/)
                    })
                    if (!animation) return false
                    animation.pause()
                    return true
                }),
            { intervals: [10] }
        )
        .toBe(true)
}

async function expectAnimationAtSwitch(page: Page, position: 'start' | 'end') {
    const result = await page.evaluate(async (position) => {
        const animation = document.getAnimations().find((animation) => {
            return (animation.effect as ThemeAnimationEffect | null)?.pseudoElement?.match(
                /^::view-transition-(old|new)\(root\)$/
            )
        })!
        await animation.ready
        const effect = animation.effect as ThemeAnimationEffect
        const duration = Number(effect.getTiming().duration)
        animation.currentTime = position === 'start' ? 0 : duration - 0.01
        const style = window.getComputedStyle(document.documentElement, effect.pseudoElement)
        const clipPath = style.clipPath
        const circle = clipPath.match(/^circle\((\S+)px at (\S+)px (\S+)px\)$/)
        const otherLayer =
            effect.pseudoElement === '::view-transition-old(root)'
                ? '::view-transition-new(root)'
                : '::view-transition-old(root)'
        const button = [...document.querySelectorAll('.VPSwitchAppearance')].find(
            (node) => node.getBoundingClientRect().width > 0
        )!
        const rect = button.getBoundingClientRect()
        return {
            clipPath,
            circle: circle ? { radius: Number(circle[1]), x: Number(circle[2]), y: Number(circle[3]) } : null,
            center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
            foreground:
                Number(style.zIndex) > Number(window.getComputedStyle(document.documentElement, otherLayer).zIndex)
        }
    }, position)

    expect(result.circle, result.clipPath).not.toBeNull()
    expect(result.circle!.x).toBeCloseTo(result.center.x, 1)
    expect(result.circle!.y).toBeCloseTo(result.center.y, 1)
    expect(result.foreground).toBe(true)
}

async function finishThemeAnimation(page: Page) {
    await page.evaluate(() => {
        for (const animation of document.getAnimations()) {
            if (
                (animation.effect as ThemeAnimationEffect | null)?.pseudoElement?.match(
                    /^::view-transition-(old|new)\(root\)$/
                )
            ) {
                animation.finish()
            }
        }
    })
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    document
                        .getAnimations()
                        .filter((animation) =>
                            (animation.effect as ThemeAnimationEffect | null)?.pseudoElement?.match(
                                /^::view-transition-(old|new)\(root\)$/
                            )
                        ).length
            )
        )
        .toBe(0)
}

for (const deviceScaleFactor of [1, 1.25, 2, 3]) {
    test.describe(`theme animation at DPR ${deviceScaleFactor}`, () => {
        test.use({ deviceScaleFactor, viewport: { width: 1440, height: 900 }, colorScheme: 'light' })

        test('both directions stay centered on the switch, including an off-center click', async ({ page }) => {
            await page.goto('/')
            const themeSwitch = page.locator('.VPSwitchAppearance:visible')

            for (const dark of [true, false]) {
                await themeSwitch.click({ position: { x: 3, y: 3 } })
                await pauseThemeAnimation(page)
                await expect(themeSwitch).toHaveAttribute('aria-checked', String(dark))
                await expectAnimationAtSwitch(page, 'start')
                await expectAnimationAtSwitch(page, 'end')
                await finishThemeAnimation(page)
            }
        })
    })
}

test.describe('theme animation interactions', () => {
    test.use({ deviceScaleFactor: 2, colorScheme: 'light' })

    test('keyboard toggles stay centered after scrolling an article', async ({ page }) => {
        await page.goto('/posts/2025/pget')
        await page.evaluate(() => window.scrollTo(0, 800))
        const themeSwitch = page.locator('.VPSwitchAppearance:visible')
        await themeSwitch.focus()
        await page.keyboard.press('Enter')
        await pauseThemeAnimation(page)
        await expectAnimationAtSwitch(page, 'end')
        await finishThemeAnimation(page)
        await page.keyboard.press('Space')
        await pauseThemeAnimation(page)
        await expectAnimationAtSwitch(page, 'start')
        await finishThemeAnimation(page)
    })

    test('mobile menu uses the visible switch as its animation center', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto('/')
        await page.locator('.VPNavBarHamburger').click()
        const themeSwitch = page.locator('.VPSwitchAppearance:visible')
        await expect(themeSwitch).toBeVisible()
        // Wait for the menu entrance to settle before measuring the switch.
        await page.waitForTimeout(350)
        for (let index = 0; index < 2; index++) {
            await themeSwitch.click()
            await pauseThemeAnimation(page)
            await expectAnimationAtSwitch(page, 'end')
            await finishThemeAnimation(page)
        }
    })

    test('rapid clicks do not overlap transitions or leave animations behind', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto('/')
        const themeSwitch = page.locator('.VPSwitchAppearance:visible')
        await themeSwitch.click()
        await pauseThemeAnimation(page)
        await themeSwitch.evaluate((node: HTMLElement) => {
            for (let index = 0; index < 5; index++) node.click()
        })
        await expect(themeSwitch).toHaveAttribute('aria-checked', 'true')
        await finishThemeAnimation(page)
        await themeSwitch.click()
        await pauseThemeAnimation(page)
        await expect(themeSwitch).toHaveAttribute('aria-checked', 'false')
        await finishThemeAnimation(page)
        expect(errors).toEqual([])
    })

    test('a skipped snapshot does not break the next theme switch', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.addInitScript(() => {
            const startViewTransition = document.startViewTransition.bind(document)
            let skipNext = true
            document.startViewTransition = (...args) => {
                const transition = startViewTransition(...args)
                if (skipNext) {
                    skipNext = false
                    transition.skipTransition()
                    transition.finished.then(() => {
                        document.documentElement.dataset.skippedThemeTransition = 'finished'
                    })
                }
                return transition
            }
        })
        await page.goto('/')
        const themeSwitch = page.locator('.VPSwitchAppearance:visible')
        await themeSwitch.click()
        await expect(themeSwitch).toHaveAttribute('aria-checked', 'true')
        await expect(page.locator('html')).toHaveAttribute('data-skipped-theme-transition', 'finished')
        await themeSwitch.click()
        await pauseThemeAnimation(page)
        await expectAnimationAtSwitch(page, 'start')
        await finishThemeAnimation(page)
        await expect(themeSwitch).toHaveAttribute('aria-checked', 'false')
        expect(errors).toEqual([])
    })

    for (const fallback of ['reduced motion', 'unsupported browser']) {
        test(`theme still toggles without animation for ${fallback}`, async ({ page }) => {
            if (fallback === 'reduced motion') {
                await page.emulateMedia({ reducedMotion: 'reduce' })
            } else {
                await page.addInitScript(() => {
                    Object.defineProperty(document, 'startViewTransition', { value: undefined })
                })
            }
            await page.addInitScript(() => {
                const animate = window.Element.prototype.animate
                window.Element.prototype.animate = function (...args) {
                    document.documentElement.dataset.themeAnimationStarted = 'true'
                    return animate.apply(this, args)
                }
            })
            await page.goto('/')
            const themeSwitch = page.locator('.VPSwitchAppearance:visible')
            for (const dark of [true, false]) {
                await themeSwitch.click()
                await expect(themeSwitch).toHaveAttribute('aria-checked', String(dark))
            }
            await expect(page.locator('html')).not.toHaveAttribute('data-theme-animation-started', 'true')
        })
    }
})
