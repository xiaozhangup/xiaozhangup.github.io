# xiaozhangup 的博客

站点：https://blog.xiaozhangup.me

使用 GitHub Pages、Jekyll 和 Minima 主题，从 `main` 分支根目录自动部署。

## 发布文章

在 `_posts` 目录添加 `YYYY-MM-DD-文章标题.md`，例如：

```markdown
---
layout: post
title: "我的第一篇文章"
date: 2026-11-14 22:00:00 +0800
---

在这里写文章正文。
```

提交到 `main` 后，GitHub Pages 会自动构建发布。

## 修改站点

- `index.md`：首页内容。
- `_config.yml`：标题、简介和主题配置。
- `CNAME`：自定义域名 `blog.xiaozhangup.me`。

DNS：`blog` 的 CNAME 指向 `xiaozhangup.github.io`。
