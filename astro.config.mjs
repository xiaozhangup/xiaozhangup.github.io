import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified as createMarkdownProcessor } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/postcss";
import playformCompress from "@playform/compress";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import { smartLinks } from "astro-smart-links";
import { defineConfig } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import { CODE_THEME, USER_SITE } from "./src/config.ts";

import updateConfig from "./src/integration/updateConfig.ts";

import { remarkReadingTime } from "./src/plugins/remark-reading-time";

const createExternalLinkIcon = () => ({
  type: "element",
  tagName: "span",
  properties: { className: ["smart-link-icon"], "aria-hidden": "true" },
  children: [],
});

// https://astro.build/config
export default defineConfig({
  site: USER_SITE,
  output: "static",
  style: {
    scss: {
      includePaths: ["./src/styles"],
    },
  },
  integrations: [
    updateConfig(),
    expressiveCode({
      themes: [CODE_THEME],
      styleOverrides: {
        borderRadius: "0.75rem",
      },
    }),
    mdx(),
    icon(),
    sitemap(),
    smartLinks({
      internalLinkClass: "smart-link smart-link--internal",
      externalLinkClass: "smart-link smart-link--external",
      brokenLinkClass: "smart-link smart-link--broken",
      content: null,
      // Assets such as /rss.xml are linked from the template; treat every
      // emitted file as a valid route instead of HTML pages only.
      includeAllFiles: true,
      customExternalLinkTransform: (node, meta) => {
        node.properties.className = [...(node.properties.className || []), meta.className];
        node.properties.target = "_blank";
        node.properties.rel = "noopener noreferrer";
        node.children.push(createExternalLinkIcon());
      },
    }),
    playformCompress({
      Exclude: [(file) => /(?:^|\/)wallpapers\/desktop-(wide|ultrawide)\.jpg$/.test(file)],
    }),
  ],
  markdown: {
    processor: createMarkdownProcessor({
      remarkPlugins: [remarkMath, remarkReadingTime],
      rehypePlugins: [rehypeKatex],
    }),
  },
  vite: {
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
  },
});
