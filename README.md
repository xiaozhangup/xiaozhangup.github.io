# xiaozhangup 的博客

站点：https://blog.xiaozhangup.me

使用 Astro 内容集合和自制的 GNOME / libadwaita 风格桌面界面，包含文章管理器、Markdown 阅读窗口、分类、标签、归档、全文搜索、RSS 和深浅色模式。

## 本地开发

使用 Node.js 24 和 pnpm 11.8.0：

```sh
npm install -g pnpm@11.8.0
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm build` 运行 Astro 类型检查、静态构建和 Pagefind 搜索索引生成。
`pnpm preview` 预览完整构建结果（包括搜索）。

## 发布文章

在 `src/content/blog/` 中添加 Markdown 或 MDX 文件，例如 `my-first-post.md`：

```markdown
---
title: 我的第一篇文章
description: 这里填写文章摘要。
pubDate: 2026-11-14T22:00:00+08:00
categories: [技术]
tags: [Astro, 随记]
draft: false
---

这里填写正文。标题已由主题显示，正文从二级标题开始。

## 第一节

正文内容。
```

文章地址为 `/blog/my-first-post`。分类、标签、首页列表、归档、RSS 和搜索索引根据文章自动生成。设置 `draft: true` 后不会发布到生产站点。

## 自动部署

推送到 `main` 自动触发 `.github/workflows/deploy.yml`，安装依赖、检查、构建并部署 GitHub Pages。
也可在 Actions 页面手动运行。Pages Source 使用 GitHub Actions，域名和强制 HTTPS 保持启用。

- `frosti.config.yaml`：名称、简介、主题颜色、导航、社交链接和每页文章数。
- `src/layouts/DesktopShell.astro`：桌面、Dock 和窗口结构。
- `src/styles/desktop.css`：桌面样式。
- `src/desktop/desktop.ts`：窗口操作、导航、搜索和 Spotify 状态。
- `src/pages/index.astro`：首页入口。
- `src/pages/about.astro`：关于窗口入口。
- `src/pages/blog/[...slug].astro`：Markdown 文章页面与独立链接。
- `src/content/blog/`：文章。
- `public/profile.png`：头像及站点图标。
- `public/CNAME`：自定义域名。

## 桌面外链和顶栏菜单

- `desktop-shortcuts.yaml` 的快捷方式从桌面左下角按顺序向上排列。每项可设置名称、目标地址、图标和是否在新标签页打开。
- `topbar-contacts.yaml` 的每个 `menus` 项对应顶栏左侧一个按钮。菜单的 `items` 可组合普通链接、`mailto:` 链接和复制动作，并设置图标、双语名称和复制提示。当前 GitHub、邮箱菜单可直接作为示例。设置 `mobile: false` 可让指定菜单仅在桌面出现。

编辑这两份配置并推送到 `main` 后，GitHub Actions 会自动部署。

## 界面与内容

桌面左侧 Dock 可打开文章、分类、标签、搜索和关于窗口。文章窗口支持关闭、最小化、恢复、最大化和拖动；聚焦窗口标题后可用方向键移动，点击窗口的移动按钮可居中。手机端 Dock 位于底部。文章正文由 Astro 在构建时渲染，全文搜索由 Pagefind 索引生成。

`public/desktop-wallpaper.png` 是为该桌面生成的插画壁纸。项目保留了原 Frosti 模板所需的 MIT 许可证及部分 Markdown / MDX 组件。

## Spotify 播放状态

桌面顶栏、移动端快捷设置和音乐窗口从 Cloudflare Worker 获取播放状态及收听记录。Worker 源码位于 `workers/spotify/`，生产地址由工作流中的 `PUBLIC_SPOTIFY_ENDPOINT` 配置。Spotify Client Secret 和 Refresh Token 保存在 Worker 的加密密钥中。Spotify 刷新令牌到期后需要重新授权并更新 Worker 密钥。
