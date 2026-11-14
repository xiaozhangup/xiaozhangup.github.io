# xiaozhangup 的博客

站点：https://blog.xiaozhangup.me

使用 Astro 生成静态网页，通过 GitHub Actions 自动部署到 GitHub Pages。

## 本地开发

使用 Node.js 24：

```sh
npm ci
npm run dev
```

运行 `npm run build` 构建到 `dist/`，运行 `npm run preview` 预览构建结果。

## 自动发布

提交并推送到 `main` 后，`.github/workflows/deploy.yml` 会自动安装依赖、构建网站并部署。
也可以在 GitHub Actions 中手动运行工作流。仅本地 commit、不 push 不会触发部署。

GitHub Pages 的 Source 设置为 GitHub Actions。自定义域名保持为 `blog.xiaozhangup.me`，已启用强制 HTTPS。

## 修改页面或添加文章

- `src/pages/index.md`：首页内容。
- `src/layouts/Page.astro`：共用页面布局和样式。
- `astro.config.mjs`：Astro 配置与站点地址。
- `public/`：直接复制到网站的静态资源，包括 `CNAME`。

例如添加 `src/pages/posts/hello.md`：

```markdown
---
layout: ../../layouts/Page.astro
title: 我的第一篇文章
---

# 我的第一篇文章

在这里写正文。
```

发布后地址为 `/posts/hello`。在首页添加 `[我的第一篇文章](/posts/hello)` 即可链接到文章。

部署方式参考：https://docs.astro.build/en/guides/deploy/github/
