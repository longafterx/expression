import { defineConfig } from 'vitepress'
import { getPosts } from './theme/serverUtils'

//每页的文章数量
const pageSize = 10

const isProd = process.env.NODE_ENV === 'production'

function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default defineConfig({
    title: '章北海',
    base: '/',
    cacheDir: './node_modules/vitepress_cache',
    description: 'vitepress,blog,thoughts',
    ignoreDeadLinks: true,
    themeConfig: {
        posts: await getPosts(pageSize),
        website: 'https://github.com/longafterx', //copyright link
        // 评论的仓库地址 https://giscus.app/ 请按照这个官方初始化后覆盖
        comment: {
            repo: 'longafterx/expression',
            repoId: 'R_kgDONQJ6eg',
            categoryId: 'DIC_kwDONQJ6es4CpwYH'
        },
        nav: [
            { text: '首页', link: '/' },
            { text: '技术', link: '/pages/tech' },
            { text: '随笔', link: '/pages/essays' },
            { text: '时间线', link: '/pages/archives' },
            { text: '标签', link: '/pages/tags' },
            { text: '关于', link: '/pages/about' }
            // { text: 'Airene', link: 'http://airene.net' }  -- External link test
        ],
        search: {
            provider: 'local'
        },
        //outline:[2,3],
        outline: {
            label: '目录'
        },
        socialLinks: [{ icon: 'github', link: 'https://github.com/longafterx/expression' }]
    } as any,

    srcExclude: isProd
        ? [
              '**/trash/**/*.md', // 排除所有 trash 目录
              '**/draft/**/*.md', // 递归排除子目录
              '**/private-notes/*.md', // 排除特定文件
              'docs/**/*.md',
              'AGENTS.md',
              'README.md'
          ]
        : ['docs/**/*.md', 'AGENTS.md', 'README.md'],
    vite: {
        //build: { minify: false }
        server: { port: 5000 }
    },
    cleanUrls: true,
    markdown: {
        config(md) {
            const defaultFence =
                md.renderer.rules.fence ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

            md.renderer.rules.fence = (tokens, idx, options, env, self) => {
                const token = tokens[idx]
                const info = token.info.trim().split(/\s+/)[0]

                if (info === 'mermaid') {
                    const encodedCode = escapeHtml(JSON.stringify(token.content))
                    return `<Mermaid :code="${encodedCode}" />`
                }

                return defaultFence(tokens, idx, options, env, self)
            }
        }
    }
    /*
      optimizeDeps: {
          keepNames: true
      }
      */
})
