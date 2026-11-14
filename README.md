# xiaozhangup 的博客

站点：https://blog.xiaozhangup.me

使用 Astro 和 [Frosti](https://github.com/EveSunMaple/Frosti) 主题，包含首页最新文章、分页文章列表、分类、标签、归档、搜索、RSS 和深浅色模式。

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
- `src/pages/index.astro`：首页。
- `src/pages/about.astro`：关于页。
- `src/content/blog/`：文章。
- `public/profile.png`：头像及站点图标。
- `public/CNAME`：自定义域名。

## 主题来源

Frosti 4.1.0，上游提交 `e8ebaa9a1a04784686ca403e882a95e04f9b8bf6`。保留上游 MIT 许可证及页脚署名，清理了演示文章、演示项目和作者个人资料，并配置中文界面。
