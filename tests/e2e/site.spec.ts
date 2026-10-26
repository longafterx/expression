import { test, expect } from '@playwright/test'

test('home page loads', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: '首页' })).toBeVisible()
    await expect(page.locator('.post-list').first()).toBeVisible()
})

test('pagination navigates to another page when available', async ({ page }) => {
    await page.goto('/')

    const nextPageLink = page.getByRole('link', { name: '下一页' })
    await expect(nextPageLink).toBeVisible()
    await nextPageLink.click()

    await expect(page).toHaveURL(/\/page_2$/)
})

test('short listing pages do not leave extra whitespace below the footer', async ({ page }) => {
    await page.goto('/page_2', { waitUntil: 'networkidle' })

    const metrics = await page.evaluate(() => {
        const footer = document.querySelector('.site-footer')?.getBoundingClientRect()
        const footerBottom = footer ? footer.bottom + window.scrollY : 0
        return {
            scrollHeight: document.documentElement.scrollHeight,
            trailingSpace: document.documentElement.scrollHeight - footerBottom
        }
    })

    expect(metrics.trailingSpace).toBeLessThanOrEqual(8)
})

test('article page renders its title', async ({ page }) => {
    await page.goto('/posts/2020/helloworld.html')

    await expect(page.getByRole('heading', { name: 'Hello World' })).toBeVisible()
})

test('pget page renders the mermaid diagram', async ({ page }) => {
    await page.goto('/posts/2025/pget')

    await expect(page.locator('.mermaid svg').first()).toBeVisible()
})

test('pget page supports mermaid zoom controls and drag panning', async ({ page }) => {
    await page.goto('/posts/2025/pget')

    const viewport = page.locator('.mermaid-viewport').first()
    const svg = page.locator('.mermaid svg').first()
    const resetButton = page.getByRole('button', { name: '还原 Mermaid 图' }).first()
    const fullscreenButton = page.getByRole('button', { name: '全屏 Mermaid 图' }).first()

    await expect(svg).toBeVisible()
    await expect(resetButton).toHaveText('')
    await expect(fullscreenButton).toBeVisible()

    const initialTransform = await svg.evaluate((node) => node.style.transform)
    await page.getByRole('button', { name: '放大 Mermaid 图' }).first().click()
    await expect.poll(async () => svg.evaluate((node) => node.style.transform)).not.toBe(initialTransform)

    await resetButton.click()
    await expect.poll(async () => svg.evaluate((node) => node.style.transform)).toBe('translate(0px, 0px) scale(1)')

    await viewport.evaluate((node) => {
        node.dispatchEvent(
            new MouseEvent('mousedown', {
                bubbles: true,
                button: 0,
                clientX: 120,
                clientY: 120
            })
        )

        window.dispatchEvent(
            new MouseEvent('mousemove', {
                bubbles: true,
                buttons: 1,
                clientX: 200,
                clientY: 160
            })
        )

        window.dispatchEvent(
            new MouseEvent('mouseup', {
                bubbles: true,
                button: 0,
                clientX: 200,
                clientY: 160
            })
        )
    })

    await expect.poll(async () => svg.evaluate((node) => node.style.transform)).not.toBe('translate(0px, 0px) scale(1)')

    await fullscreenButton.click()
    await expect(page.locator('.mermaid-lightbox')).toBeVisible()
    await expect(page.locator('.mermaid-lightbox .mermaid svg')).toBeVisible()

    await page.locator('.mermaid-lightbox').getByRole('button', { name: '退出全屏 Mermaid 图' }).click()
    await expect(page.locator('.mermaid-lightbox')).toBeHidden()
})

test('pget page renders mermaid diagrams with unique svg ids', async ({ page }) => {
    await page.goto('/posts/2025/pget')

    const diagrams = page.locator('.mermaid svg')
    await expect(diagrams.first()).toBeVisible()

    const ids = await diagrams.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('id')))
    expect(new Set(ids).size).toBe(ids.length)
})
