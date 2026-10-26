<template>
    <Layout>
        <template #doc-before>
            <div style="padding-top: 20px" class="post-info" v-if="!$frontmatter.page">
                {{ $frontmatter.date?.substring(0, 10) }} &nbsp;&nbsp;
                <span v-for="item in $frontmatter.tags"
                    ><a :href="withBase(`/pages/tags.html?tag=${item}`)"> {{ item }}</a></span
                >
            </div>
        </template>
        <template #doc-bottom>
            <Comment />
        </template>
        <template #layout-bottom>
            <Copyright />
        </template>
    </Layout>
</template>
<script setup lang="ts">
import { nextTick, provide } from 'vue'
import DefaultTheme from 'vitepress/theme'
import Copyright from './Copyright.vue'
import { useData, withBase } from 'vitepress'
import { getThemeTransitionCircle } from '../themeTransition'

const { Layout } = DefaultTheme
const { isDark } = useData()
let transitioning = false

async function toggleAppearance(event: MouseEvent) {
    if (transitioning) return

    const toggle = event.currentTarget
    const nextThemeIsDark = !isDark.value

    if (
        !(toggle instanceof HTMLElement) ||
        !document.startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        isDark.value = nextThemeIsDark
        return
    }

    const { x, y, endRadius } = getThemeTransitionCircle(toggle.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight
    })
    const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
    transitioning = true

    const transition = document.startViewTransition(async () => {
        isDark.value = nextThemeIsDark
        await nextTick()
    })
    let animation: Animation | undefined

    try {
        await transition.ready
        animation = document.documentElement.animate(
            { clipPath: nextThemeIsDark ? clipPath.reverse() : clipPath },
            {
                duration: 680,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both',
                pseudoElement: nextThemeIsDark ? '::view-transition-old(root)' : '::view-transition-new(root)'
            }
        )
        await animation.finished
    } catch {
        // A skipped or interrupted snapshot must still release the toggle for the next click.
        transition.skipTransition()
    } finally {
        await transition.finished.catch(() => undefined)
        animation?.cancel()
        transitioning = false
    }
}

provide('toggle-appearance', toggleAppearance)
</script>
