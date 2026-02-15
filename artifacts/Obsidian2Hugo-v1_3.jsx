import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Upload, Settings, Eye, ArrowDownToLine, FileText, AlertTriangle,
  Info, ChevronLeft, ChevronRight, X, Trash2, Check, Globe, BookOpen,
  User, Copy, FolderArchive, Zap, ExternalLink, Edit3, ArrowUpCircle,
  FolderOpen
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & TEMPLATES
// ═══════════════════════════════════════════════════════════════

const HUGO_VERSION = "0.155.3";
const STEPS = ["Upload", "Configure", "Preview", "Download"];
const STEP_ICONS = [Upload, Settings, Eye, ArrowDownToLine];

const generateHugoToml = (cfg) => `baseURL = "https://${cfg.githubUsername || "username"}.github.io/${cfg.repoName || "my-blog"}/"
languageCode = "en-us"
title = "${(cfg.blogName || "My Blog").replace(/"/g, '\\"')}"
# theme is imported via [module] below, do not set theme here

[pagination]
  pagerSize = 10

[params]
  env = "production"
  description = "${(cfg.description || "").replace(/"/g, '\\"')}"
  author = "${(cfg.author || "").replace(/"/g, '\\"')}"
  defaultTheme = "auto"
  ShowReadingTime = true
  ShowShareButtons = false
  ShowPostNavLinks = true
  ShowBreadCrumbs = true
  ShowCodeCopyButtons = true
  ShowToc = true
  math = true
  mathjax = true

[params.homeInfoParams]
  Title = "${(cfg.blogName || "My Blog").replace(/"/g, '\\"')}"
  Content = "${(cfg.description || "Welcome to my blog").replace(/"/g, '\\"')}"

[markup]
  [markup.goldmark]
    [markup.goldmark.renderer]
      unsafe = true
    [markup.goldmark.extensions]
      [markup.goldmark.extensions.passthrough]
        enable = true
        [markup.goldmark.extensions.passthrough.delimiters]
          block = [["$$", "$$"]]
          inline = [["$", "$"]]

[module]
  [[module.imports]]
    path = "github.com/adityatelange/hugo-PaperMod"
`;

const generateGoMod = (cfg) => `module github.com/${cfg.githubUsername || "username"}/${cfg.repoName || "my-blog"}

go 1.23
`;

const GO_SUM = "";

const generateWorkflowYaml = () => `name: Deploy Hugo site to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

defaults:
  run:
    shell: bash

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      HUGO_VERSION: "${HUGO_VERSION}"
    steps:
      - name: Install Hugo CLI
        run: |
          wget -O ${'$'}{{ runner.temp }}/hugo.deb https://github.com/gohugoio/hugo/releases/download/v${'$'}{HUGO_VERSION}/hugo_extended_${'$'}{HUGO_VERSION}_linux-amd64.deb
          sudo dpkg -i ${'$'}{{ runner.temp }}/hugo.deb

      - name: Install Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.23'

      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        id: pages
        uses: actions/configure-pages@v5

      - name: Install Hugo Modules
        run: hugo mod get

      - name: Build with Hugo
        env:
          HUGO_CACHEDIR: ${'$'}{{ runner.temp }}/hugo_cache
          HUGO_ENVIRONMENT: production
        run: |
          hugo --minify --baseURL "${'$'}{{ steps.pages.outputs.base_url }}/"

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

  deploy:
    environment:
      name: github-pages
      url: ${'$'}{{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

const IMAGES_README = `# Images Folder

Place your blog images in this folder.

When your Obsidian notes reference images like \`![[my-image.png]]\`,
they are converted to standard markdown: \`![](my-image.png)\`.

To make them work in Hugo:
1. Copy the referenced images from your Obsidian vault into this folder
2. Hugo will serve them from /images/ path

Example:
- Markdown reference: \`![](my-image.png)\`
- File location: \`static/images/my-image.png\`
- Rendered URL: \`/images/my-image.png\`
`;

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u00C0-\u024F\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFromFilename(name) {
  return name.replace(/\.md$/i, "").replace(/[-_]/g, " ").trim();
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ═══════════════════════════════════════════════════════════════
// YAML FRONT MATTER PARSER / SERIALIZER
// ═══════════════════════════════════════════════════════════════

function parseYamlValue(str) {
  const trimmed = str.trim();
  if (trimmed === "" || trimmed === "~" || trimmed === "null") return null;
  if (trimmed === "true" || trimmed === "yes") return true;
  if (trimmed === "false" || trimmed === "no") return false;
  if (/^-?(?:0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  // Remove surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontMatter: null, body: content };

  const yamlStr = match[1];
  const body = content.slice(match[0].length).replace(/^\r?\n/, "");
  const result = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    if (line.trim() === "") continue;

    // Array item: "  - value"
    const arrMatch = line.match(/^\s+-\s+(.*)/);
    if (arrMatch && currentKey) {
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(parseYamlValue(arrMatch[1]));
      continue;
    }

    // Key-value: "key: value"
    const kvMatch = line.match(/^([\w][\w.-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const rawVal = kvMatch[2].trim();

      if (rawVal === "") {
        currentKey = key;
        result[key] = [];
      } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        const inner = rawVal.slice(1, -1);
        result[key] = inner
          ? inner.split(",").map((s) => parseYamlValue(s.trim()))
          : [];
        currentKey = key;
      } else {
        result[key] = parseYamlValue(rawVal);
        currentKey = key;
      }
    }
  }

  return { frontMatter: result, body };
}

function yamlQuote(str) {
  const s = String(str);
  if (
    /[:#\[\]{}&*!|>'"%@`,\n]/.test(s) ||
    /^(true|false|yes|no|null|~)$/i.test(s) ||
    /^\d+(\.\d+)?$/.test(s)
  ) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function serializeFrontMatter(fm) {
  const lines = [];
  // Ensure a preferred key order
  const order = ["title", "date", "draft", "tags", "math", "description"];
  const keys = [
    ...order.filter((k) => k in fm),
    ...Object.keys(fm).filter((k) => !order.includes(k)),
  ];

  for (const key of keys) {
    const value = fm[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${yamlQuote(item)}`);
      }
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yamlQuote(value)}`);
    }
  }
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// TRANSFORMATION ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Build a map from filename (without .md) to { slug, targetDir } for cross-reference resolution.
 * Also detects duplicate filenames.
 */
function buildSlugMap(files) {
  const map = new Map();
  const duplicates = [];

  for (const f of files) {
    const baseName = f.name.replace(/\.md$/i, "");
    if (map.has(baseName)) {
      duplicates.push(baseName);
    }
    map.set(baseName, { slug: f.slug || slugify(baseName), targetDir: f.targetDir || "posts" });
  }

  return { slugMap: map, duplicates };
}

/**
 * Transform image embeds: ![[image.ext]] → ![](image.ext)
 */
function transformImageEmbeds(text) {
  return text.replace(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff))\]\]/gi, (_, img) => {
    return `![](${img})`;
  });
}

/**
 * Transform wikilinks: [[name]] → [name](/posts/slug/)
 *                      [[name|display]] → [display](/posts/slug/)
 * Image embeds must be processed BEFORE this function.
 */
function transformWikilinks(text, slugMap) {
  const warnings = [];
  const resolved = new Set();

  const result = text.replace(/\[\[([^\]]+)\]\]/g, (match, inner) => {
    // Skip if this looks like an image embed that wasn't caught
    if (inner.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff)$/i)) {
      return `![](${inner})`;
    }

    let target, display;
    if (inner.includes("|")) {
      const parts = inner.split("|");
      target = parts[0].trim();
      display = parts[1].trim();
    } else {
      target = inner.trim();
      display = inner.trim();
    }

    // Handle section links: "note#section" → use "note" for slug lookup
    const targetBase = target.split("#")[0].trim();
    const section = target.includes("#") ? "#" + target.split("#").slice(1).join("#") : "";

    const entry = slugMap.get(targetBase);
    if (entry) {
      resolved.add(targetBase);
      return `[${display}](/${entry.targetDir}/${entry.slug}/${section})`;
    } else {
      // Best-effort: generate slug from target name
      const fallbackSlug = slugify(targetBase);
      if (!resolved.has(targetBase)) {
        warnings.push({
          level: "warning",
          message: `Wikilink target "${targetBase}" not found in uploaded files. Link generated as best-effort.`,
        });
      }
      return `[${display}](/posts/${fallbackSlug}/${section})`;
    }
  });

  return { text: result, warnings };
}

/**
 * Extract inline #tags from body text.
 * Tags are kept in place (not removed). Returns unique tag list.
 */
function extractInlineTags(text) {
  const tags = new Set();
  // Match #tag preceded by start-of-line or whitespace
  // Tag must start with letter, underscore, or CJK char
  const regex = /(^|[\s,;(])#([a-zA-Z_\u00C0-\u024F\u4e00-\u9fff][\w\u00C0-\u024F\u4e00-\u9fff/-]*)/gm;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const tag = m[2];
    // Skip hex colors
    if (/^[0-9a-fA-F]{3,8}$/.test(tag)) continue;
    tags.add(tag);
  }
  return Array.from(tags);
}

/**
 * Transform LaTeX:
 * 1. Escape unescaped asterisks inside math regions
 * 2. Optionally convert to alternative delimiters ($$$$, \\\\)
 * Returns transformed text, whether math was found, and any notices.
 */
function transformLatex(text, useAltDelimiters, useAltLineBreaks) {
  const warnings = [];
  let hasMath = false;

  // Protect code blocks first (they should already be protected, but belt-and-suspenders)
  const codeHolder = [];
  let safe = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
    codeHolder.push(m);
    return `%%LATEXCODE_${codeHolder.length - 1}%%`;
  });

  // Process display math ($$...$$) first — greedy for multi-line
  const displayRegex = /\$\$([\s\S]*?)\$\$/g;
  let foundDisplay = false;
  safe = safe.replace(displayRegex, (match, inner) => {
    hasMath = true;
    foundDisplay = true;
    let processed = inner;
    // Escape unescaped asterisks: * → \* (but not already escaped \*)
    processed = processed.replace(/(^|[^\\])\*/g, "$1\\*");

    // Convert \\ to \\\\ for line breaks if enabled
    if (useAltLineBreaks) {
      processed = processed.replace(/(^|[^\\])\\\\([^\\]|$)/g, "$1\\\\\\\\$2");
    }

    // Wrap with $$$$ or $$ depending on setting
    if (useAltDelimiters) {
      return `$$$$${processed}$$$$`;
    }
    return `$$${processed}$$`;
  });

  // Process inline math ($...$) — single line only, non-greedy
  // Match $ not preceded by another $ (captured), and followed by non-$ (lookahead, not consumed)
  const inlineRegex = /(^|[^$])\$([^$\n]+?)\$(?=[^$]|$)/g;
  safe = safe.replace(inlineRegex, (match, pre, inner) => {
    // Skip if it looks like currency: $5, $10.00
    if (/^\d/.test(inner.trim())) return match;
    hasMath = true;
    let processed = inner;
    processed = processed.replace(/(^|[^\\])\*/g, "$1\\*");
    return `${pre}$${processed}$`;
  });

  if (hasMath && !useAltDelimiters && !useAltLineBreaks) {
    warnings.push({
      level: "notice",
      message: 'LaTeX detected. Standard delimiters are used. If math does not render correctly, try enabling alternative $$$$ delimiters or \\\\\\\\ line breaks in Configure settings.',
    });
  }

  if (hasMath && useAltDelimiters) {
    warnings.push({
      level: "info",
      message: "Alternative delimiter mode: display math uses $$$$ delimiters.",
    });
  }

  if (hasMath && useAltLineBreaks) {
    warnings.push({
      level: "info",
      message: "Alternative line break mode: \\\\ in display math is converted to \\\\\\\\.",
    });
  }

  // Restore code blocks
  safe = safe.replace(/%%LATEXCODE_(\d+)%%/g, (_, i) => codeHolder[parseInt(i)]);

  return { text: safe, hasMath, warnings };
}

/**
 * Full single-file transformation pipeline.
 */
function transformFile(file, slugMap, config) {
  const warnings = [];
  let content = file.originalContent;

  // 1. Parse existing front matter
  const { frontMatter: existingFm, body } = parseFrontMatter(content);
  let text = body;

  // 2. Protect code blocks
  const codeBlocks = [];
  text = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
    codeBlocks.push(m);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });

  // 3. Transform image embeds (before wikilinks)
  text = transformImageEmbeds(text);

  // 4. Transform wikilinks
  const wlResult = transformWikilinks(text, slugMap);
  text = wlResult.text;
  warnings.push(...wlResult.warnings);

  // 5. Restore code blocks (before LaTeX to avoid double-protection)
  text = text.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => codeBlocks[parseInt(i)]);

  // 6. Transform LaTeX
  const latexResult = transformLatex(text, config.useAltDelimiters, config.useAltLineBreaks);
  text = latexResult.text;
  warnings.push(...latexResult.warnings);

  // 7. Extract inline tags
  const inlineTags = extractInlineTags(text);

  // 8. Build merged front matter
  const fm = { ...(existingFm || {}) };

  // Title: preserve existing, fallback to first H1 or filename
  if (!fm.title) {
    const h1Match = text.match(/^#\s+(.+)$/m);
    fm.title = h1Match ? h1Match[1].trim() : titleFromFilename(file.name);
  }

  // Date: preserve existing
  if (!fm.date && !fm.created) {
    fm.date = new Date().toISOString().split("T")[0];
  }

  // Draft: preserve existing, default false
  if (fm.draft === undefined) {
    fm.draft = false;
  }

  // Tags: merge inline + existing
  const existingTags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
  if (inlineTags.length > 0) {
    const merged = [...new Set([...existingTags, ...inlineTags])];
    if (existingTags.length > 0 && inlineTags.length > 0) {
      const newTags = inlineTags.filter((t) => !existingTags.includes(t));
      if (newTags.length > 0) {
        warnings.push({
          level: "info",
          message: `Tags exist both in the article body and front matter. All tags have been merged (${newTags.length} new tag${newTags.length > 1 ? "s" : ""} added).`,
        });
      }
    }
    fm.tags = merged;
  }

  // Math flag
  if (latexResult.hasMath) {
    fm.math = true;
  }

  // 9. Assemble output
  const fmStr = serializeFrontMatter(fm);
  const transformed = `---\n${fmStr}\n---\n\n${text}`;

  return { transformed, warnings, frontMatter: fm };
}

// ═══════════════════════════════════════════════════════════════
// HUGO TOML PARSER (minimal, for existing site import)
// ═══════════════════════════════════════════════════════════════

function parseHugoToml(content) {
  const baseURL = content.match(/baseURL\s*=\s*["']([^"']+)["']/)?.[1] || "";
  const title = content.match(/title\s*=\s*["']([^"']+)["']/)?.[1] || "";
  const description = content.match(/description\s*=\s*["']([^"']+)["']/)?.[1] || "";
  const author = content.match(/author\s*=\s*["']([^"']+)["']/)?.[1] || "";
  return { baseURL, title, description, author };
}

// ═══════════════════════════════════════════════════════════════
// ZIP OPERATIONS
// ═══════════════════════════════════════════════════════════════

async function generateSiteZip(files, config, JSZip, existingSite, preserveToml) {
  const zip = new JSZip();
  const rootName = `${slugify(config.blogName || "my-blog")}-hugo-site`;
  const root = zip.folder(rootName);

  // Build a set of new post paths for overwrite detection
  const newPostPaths = new Set();
  for (const f of files) {
    if (f.transformedContent) {
      const dir = f.targetDir || "posts";
      newPostPaths.add(`content/${dir}/${f.slug || slugify(f.name.replace(/\.md$/i, ""))}.md`);
    }
  }

  if (existingSite && existingSite.files) {
    // Merge mode: include existing site files first
    for (const [path, entry] of Object.entries(existingSite.files)) {
      if (entry.dir) continue;
      const willOverwrite = newPostPaths.has(path);
      const isHugoToml = path === "hugo.toml";
      const isGoMod = path === "go.mod" || path === "go.sum";
      const isWorkflow = path === ".github/workflows/hugo.yml";

      if (willOverwrite) continue;
      if (isHugoToml && !preserveToml) continue;
      if (isGoMod || isWorkflow) continue;

      const content = await entry.async("uint8array");
      root.file(path, content);
    }
  }

  // Hugo config: preserved (already copied above) or generated
  if (!existingSite || !preserveToml) {
    root.file("hugo.toml", generateHugoToml(config));
  }
  root.file("go.mod", generateGoMod(config));
  root.file("go.sum", GO_SUM);

  // GitHub Actions
  const ghFolder = root.folder(".github").folder("workflows");
  ghFolder.file("hugo.yml", generateWorkflowYaml());

  // Content: place each file in its target directory
  for (const f of files) {
    if (f.transformedContent) {
      const dir = f.targetDir || "posts";
      root.folder("content").folder(dir).file(
        `${f.slug || slugify(f.name.replace(/\.md$/i, ""))}.md`,
        f.transformedContent
      );
    }
  }

  // Static images folder
  root.folder("static").folder("images").file("README.md", IMAGES_README);

  return zip.generateAsync({ type: "base64" });
}

async function generatePostsZip(files, JSZip) {
  const zip = new JSZip();
  for (const f of files) {
    if (f.transformedContent) {
      zip.file(`${f.slug || slugify(f.name.replace(/\.md$/i, ""))}.md`, f.transformedContent);
    }
  }
  return zip.generateAsync({ type: "base64" });
}

async function parseExistingSiteZip(arrayBuffer, JSZip) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const result = {
    hugoTomlRaw: null,
    parsedConfig: null,
    existingPosts: [],
    contentDirs: [],
    files: {},
    rootPrefix: "",
  };

  const allPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);

  // Detect if zip has a single root folder wrapping everything
  // If all files start with the same "folder/" prefix, strip it
  let rootPrefix = "";
  if (allPaths.length > 0) {
    const firstSlash = allPaths[0].indexOf("/");
    if (firstSlash > 0) {
      const candidate = allPaths[0].slice(0, firstSlash + 1);
      const allMatch = allPaths.every((p) => p.startsWith(candidate));
      if (allMatch) {
        rootPrefix = candidate;
      }
    }
  }
  result.rootPrefix = rootPrefix;

  // Normalize path by stripping root prefix
  const normalize = (p) => (rootPrefix && p.startsWith(rootPrefix) ? p.slice(rootPrefix.length) : p);

  // Collect content directories (unique set)
  const contentDirSet = new Set();

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const normalPath = normalize(path);

    // Detect hugo.toml
    if (normalPath === "hugo.toml") {
      result.hugoTomlRaw = await entry.async("string");
      result.parsedConfig = parseHugoToml(result.hugoTomlRaw);
    }

    // Scan all content/ subdirectories for .md files (excluding _index.md)
    if (normalPath.startsWith("content/") && normalPath.endsWith(".md")) {
      const fileName = normalPath.split("/").pop();
      if (fileName !== "_index.md") {
        result.existingPosts.push(normalPath);
      }
      // Extract the directory path relative to content/
      const relDir = normalPath.slice("content/".length);
      const dirParts = relDir.split("/");
      if (dirParts.length > 1) {
        // Build all parent directory paths
        for (let i = 1; i < dirParts.length; i++) {
          contentDirSet.add(dirParts.slice(0, i).join("/"));
        }
      }
    }

    // Store with normalized path
    result.files[normalPath] = entry;
  }

  // Sort content dirs and always ensure "posts" is an option
  result.contentDirs = Array.from(contentDirSet).sort();
  if (!result.contentDirs.includes("posts")) {
    result.contentDirs.unshift("posts");
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// LINE-LEVEL DIFF
// ═══════════════════════════════════════════════════════════════

/**
 * Compute a simple line-level diff using longest common subsequence (LCS).
 * Returns two arrays of line markers: one for the original, one for the transformed.
 * Each marker is: "same", "removed" (left only), or "added" (right only).
 */
function computeLineDiff(originalText, transformedText) {
  const origLines = (originalText || "").split("\n");
  const transLines = (transformedText || "").split("\n");

  const m = origLines.length;
  const n = transLines.length;

  // Skip diff for very large files (>2000 lines) to avoid UI lag
  if (m * n > 4000000) {
    return { origMarkers: new Array(m).fill("same"), transMarkers: new Array(n).fill("same") };
  }

  // Build full LCS table for backtracking
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === transLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff markers
  let i = m, j = n;
  const origResult = [];
  const transResult = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === transLines[j - 1]) {
      origResult.unshift("same");
      transResult.unshift("same");
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      transResult.unshift("added");
      j--;
    } else {
      origResult.unshift("removed");
      i--;
    }
  }

  return { origMarkers: origResult, transMarkers: transResult };
}

// ═══════════════════════════════════════════════════════════════
// INLINE UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

function Badge({ level, children }) {
  const colors = {
    error: "bg-red-500/20 text-red-300 border-red-500/30",
    warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    notice: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    success: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    pending: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[level] || colors.pending}`}>
      {children}
    </span>
  );
}

function CodePreview({ content, label, lineNumbers = true, markers = null }) {
  const lines = content ? content.split("\n") : [];

  const getLineStyle = (idx) => {
    if (!markers || !markers[idx]) return {};
    if (markers[idx] === "removed") return { background: "rgba(239, 68, 68, 0.12)", borderLeft: "3px solid rgba(239, 68, 68, 0.5)" };
    if (markers[idx] === "added") return { background: "rgba(74, 222, 128, 0.10)", borderLeft: "3px solid rgba(74, 222, 128, 0.45)" };
    return {};
  };

  const getTextColor = (idx) => {
    if (!markers || !markers[idx]) return "#c8c8e0";
    if (markers[idx] === "removed") return "#f0a0a0";
    if (markers[idx] === "added") return "#a0e0b0";
    return "#c8c8e0";
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col rounded-lg overflow-hidden border border-gray-700/50">
      <div className="px-4 py-2 text-xs font-semibold tracking-wide" style={{ background: "#1e1e2e", color: "#a0a0c0" }}>
        {label}
      </div>
      <div className="overflow-auto flex-1 text-sm leading-relaxed" style={{ background: "#12121c", maxHeight: "520px" }}>
        <pre className="p-0 m-0">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex hover:bg-white/5 transition-colors" style={getLineStyle(i)}>
                {lineNumbers && (
                  <span className="inline-block w-12 text-right pr-3 select-none flex-shrink-0" style={{ color: "#4a4a6a" }}>
                    {i + 1}
                  </span>
                )}
                <span className="flex-1 whitespace-pre-wrap break-all px-2" style={{ color: getTextColor(i) }}>
                  {line || " "}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function Obsidian2Hugo() {
  // ─── State ─────────────────────────────────
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState([]);
  const [config, setConfig] = useState({
    blogName: "My Blog",
    description: "A blog powered by Hugo and PaperMod",
    author: "",
    githubUsername: "",
    repoName: "my-blog",
    useAltDelimiters: false,
    useAltLineBreaks: false,
  });
  const [remember, setRemember] = useState(false);
  const [existingSite, setExistingSite] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [jsZipReady, setJsZipReady] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [siteBase64, setSiteBase64] = useState(null);
  const [postsBase64, setPostsBase64] = useState(null);
  const [copied, setCopied] = useState(false);
  const [preserveToml, setPreserveToml] = useState(true);

  const mdInputRef = useRef(null);
  const zipInputRef = useRef(null);

  // ─── Load JSZip ────────────────────────────
  useEffect(() => {
    if (window.JSZip) { setJsZipReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => setJsZipReady(true);
    s.onerror = () => console.error("Failed to load JSZip");
    document.head.appendChild(s);
  }, []);

  // ─── Load saved preferences ────────────────
  useEffect(() => {
    (async () => {
      try {
        const u = await window.storage.get("obsidian2hugo:githubUsername");
        const r = await window.storage.get("obsidian2hugo:repoName");
        if (u?.value || r?.value) {
          setConfig((c) => ({
            ...c,
            githubUsername: u?.value || c.githubUsername,
            repoName: r?.value || c.repoName,
          }));
          setRemember(true);
        }
      } catch (_) { /* storage not available */ }
    })();
  }, []);

  // ─── File handling ─────────────────────────
  const handleMdFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList)
      .filter((f) => f.name.endsWith(".md"))
      .map((f) => ({
        id: generateId(),
        name: f.name,
        size: f.size,
        slug: slugify(f.name.replace(/\.md$/i, "")),
        targetDir: "posts",
        originalContent: null,
        transformedContent: null,
        warnings: [],
        status: "pending",
        file: f,
      }));

    // Read files
    for (const nf of newFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === nf.id ? { ...f, originalContent: ev.target.result, status: "ready" } : f
          )
        );
      };
      reader.onerror = () => {
        setFiles((prev) =>
          prev.map((f) => (f.id === nf.id ? { ...f, status: "error", warnings: [{ level: "error", message: "Failed to read file" }] } : f))
        );
      };
      reader.readAsText(nf.file);
    }

    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const unique = newFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...unique];
    });
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    handleMdFiles(e.dataTransfer.files);
  }, [handleMdFiles]);

  const handleZipUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file || !jsZipReady) return;
    setZipLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseExistingSiteZip(buf, window.JSZip);
      setExistingSite(parsed);
      if (parsed.parsedConfig) {
        setConfig((c) => ({
          ...c,
          blogName: parsed.parsedConfig.title || c.blogName,
          description: parsed.parsedConfig.description || c.description,
          author: parsed.parsedConfig.author || c.author,
        }));
      }
    } catch (err) {
      console.error("Failed to parse zip:", err);
    }
    setZipLoading(false);
  }, [jsZipReady]);

  const removeFile = useCallback((id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ─── Transform all files ──────────────────
  const runTransform = useCallback(() => {
    setFiles((prev) => {
      const readyFiles = prev.filter((f) => f.originalContent);
      const { slugMap, duplicates } = buildSlugMap(readyFiles);

      return prev.map((f) => {
        if (!f.originalContent) return { ...f, status: "error", warnings: [{ level: "error", message: "File content not loaded" }] };

        try {
          const { transformed, warnings, frontMatter } = transformFile(f, slugMap, config);

          // Add duplicate warnings
          const baseName = f.name.replace(/\.md$/i, "");
          const allWarnings = [...warnings];
          if (duplicates.includes(baseName)) {
            allWarnings.push({ level: "warning", message: `Duplicate filename "${f.name}" detected. Wikilink resolution may be ambiguous.` });
          }

          // Check conflicts with existing site
          if (existingSite) {
            const targetPath = `content/${f.targetDir || "posts"}/${f.slug}.md`;
            if (existingSite.existingPosts.includes(targetPath)) {
              allWarnings.push({ level: "warning", message: `"${targetPath}" already exists in the uploaded Hugo site. It will be overwritten.` });
            }
          }

          return { ...f, transformedContent: transformed, warnings: allWarnings, status: "transformed", frontMatter };
        } catch (err) {
          return { ...f, status: "error", warnings: [{ level: "error", message: `Transformation failed: ${err.message}` }] };
        }
      });
    });
  }, [config, existingSite]);

  // ─── Generate downloads ───────────────────
  const transformedFiles = useMemo(() => files.filter((f) => f.status === "transformed"), [files]);

  const generateDownloads = useCallback(async () => {
    if (!jsZipReady || transformedFiles.length === 0) return;
    setZipLoading(true);
    try {
      // Only generate site zip when GitHub config or existing site is present
      const hasGH = config.githubUsername.trim() !== "" && config.repoName.trim() !== "";
      if (hasGH || existingSite) {
        const sb64 = await generateSiteZip(transformedFiles, config, window.JSZip, existingSite, preserveToml);
        setSiteBase64(sb64);
      }
      if (transformedFiles.length > 1) {
        const pb64 = await generatePostsZip(transformedFiles, window.JSZip);
        setPostsBase64(pb64);
      }
    } catch (err) {
      console.error("Zip generation failed:", err);
    }
    setZipLoading(false);
  }, [jsZipReady, transformedFiles, config, existingSite, preserveToml]);

  // ─── Save preferences ─────────────────────
  const savePreferences = useCallback(async () => {
    try {
      if (remember) {
        await window.storage.set("obsidian2hugo:githubUsername", config.githubUsername);
        await window.storage.set("obsidian2hugo:repoName", config.repoName);
      } else {
        try { await window.storage.delete("obsidian2hugo:githubUsername"); } catch (_) {}
        try { await window.storage.delete("obsidian2hugo:repoName"); } catch (_) {}
      }
    } catch (_) {}
  }, [remember, config.githubUsername, config.repoName]);

  // ─── Slug update ──────────────────────────
  const updateSlug = useCallback((id, newSlug) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, slug: newSlug } : f)));
  }, []);

  // ─── Target directory update ──────────────
  const updateTargetDir = useCallback((id, newDir) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, targetDir: newDir } : f)));
  }, []);

  // ─── Copy to clipboard ────────────────────
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Step navigation ──────────────────────
  const canProceed = step === 0 ? files.length > 0 :
                     step === 1 ? config.blogName.trim() !== "" :
                     step === 2 ? true : false;

  const goNext = async () => {
    if (step === 1) {
      await savePreferences();
      runTransform();
      setPreviewIndex(0);
    }
    if (step === 2) {
      // Reset zip data — user will generate on demand from Download step
      setSiteBase64(null);
      setPostsBase64(null);
    }
    setStep((s) => Math.min(s + 1, 3));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  // ─── Warning/info counts ──────────────────
  const allWarnings = useMemo(() => files.flatMap((f) => f.warnings), [files]);
  const warningCount = allWarnings.filter((w) => w.level === "warning" || w.level === "error").length;
  const infoCount = allWarnings.filter((w) => w.level === "info" || w.level === "notice").length;

  // ─── Derived values ───────────────────────
  const hasGithubConfig = config.githubUsername.trim() !== "" && config.repoName.trim() !== "";
  const canGenerateSite = hasGithubConfig || !!existingSite;
  const blogUrl = `https://${config.githubUsername || "username"}.github.io/${config.repoName || "my-blog"}/`;
  const gitCommands = `cd ${slugify(config.blogName || "my-blog")}-hugo-site
git init
git add .
git commit -m "Initial Hugo site from Obsidian2Hugo"
git branch -M main
git remote add origin https://github.com/${config.githubUsername || "username"}/${config.repoName || "my-blog"}.git
git push -u origin main`;

  // ═════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════

  const containerStyle = {
    background: "linear-gradient(160deg, #0c0c18 0%, #111125 50%, #0e0e1a 100%)",
    color: "#e0e0f0",
    fontFamily: "'Segoe UI', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    minHeight: "100vh",
  };

  const cardStyle = {
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid rgba(120, 100, 200, 0.15)",
    borderRadius: "12px",
  };

  return (
    <div style={containerStyle} className="p-4 sm:p-6">
      {/* ─── Header ─────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
            <Zap size={20} color="#fff" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Obsidian2Hugo</h1>
            <p className="text-xs" style={{ color: "#7a7a9a" }}>Zero-config blog publisher</p>
          </div>
        </div>
        <span className="text-xs" style={{ color: "#5a5a7a" }}>v1.3 MVP</span>
      </div>

      {/* ─── Step Indicator ─────────── */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((name, i) => {
          const Icon = STEP_ICONS[i];
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={name} className="flex items-center gap-2">
              <button
                onClick={() => { if (isDone) setStep(i); }}
                disabled={!isDone && !isActive}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  isActive
                    ? "text-white shadow-lg"
                    : isDone
                    ? "text-gray-300 hover:text-white cursor-pointer"
                    : "text-gray-600 cursor-default"
                }`}
                style={isActive ? { background: "linear-gradient(135deg, #7c3aed, #6d28d9)" } : {}}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{name}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="w-8 h-px" style={{ background: isDone ? "#7c3aed" : "#2a2a4a" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Step Content ──────────── */}
      <div className="max-w-4xl mx-auto">

        {/* ═══ STEP 0: UPLOAD ═══ */}
        {step === 0 && (
          <div className="space-y-6">
            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={() => mdInputRef.current?.click()}
              className="cursor-pointer rounded-xl p-12 text-center transition-all hover:border-purple-500/50"
              style={{ border: "2px dashed rgba(120, 100, 200, 0.3)", background: "rgba(20, 20, 40, 0.4)" }}
            >
              <ArrowUpCircle size={40} className="mx-auto mb-4" style={{ color: "#6a6a8a" }} />
              <p className="text-lg text-gray-200">
                Drop your Obsidian <span className="font-mono text-purple-400">.md</span> files here
              </p>
              <p className="text-sm mt-1" style={{ color: "#6a6a8a" }}>or click to browse — multiple files supported</p>
              <input
                ref={mdInputRef}
                type="file"
                accept=".md"
                multiple
                onChange={(e) => handleMdFiles(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Existing site upload */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px" style={{ background: "#2a2a4a" }} />
              <span className="text-xs tracking-widest" style={{ color: "#5a5a7a" }}>UPDATING AN EXISTING BLOG?</span>
              <div className="flex-1 h-px" style={{ background: "#2a2a4a" }} />
            </div>

            <div className="text-center">
              <button
                onClick={() => zipInputRef.current?.click()}
                disabled={!jsZipReady}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all border"
                style={{ borderColor: "rgba(120, 100, 200, 0.3)", color: "#c0c0e0", background: "rgba(20, 20, 40, 0.5)" }}
              >
                <FolderArchive size={16} />
                Upload existing Hugo site (.zip)
              </button>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipUpload}
                className="hidden"
              />
              {existingSite && (
                <div className="mt-3 text-sm text-emerald-400 flex items-center gap-2 justify-center">
                  <Check size={14} />
                  Site loaded{existingSite.parsedConfig?.title ? `: "${existingSite.parsedConfig.title}"` : ""} — {existingSite.existingPosts.length} existing post(s), {existingSite.contentDirs.length} content director{existingSite.contentDirs.length !== 1 ? "ies" : "y"}
                </div>
              )}
              {zipLoading && <p className="mt-2 text-sm text-purple-400">Loading zip...</p>}
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: "#8a8aa0" }}>
                  {files.length} file{files.length > 1 ? "s" : ""} · {formatFileSize(files.reduce((s, f) => s + f.size, 0))}
                </p>
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg"
                    style={cardStyle}
                  >
                    <FileText size={18} style={{ color: "#7a7a9a" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{f.name}</p>
                      <p className="text-xs" style={{ color: "#5a5a7a" }}>
                        {formatFileSize(f.size)} · slug: {f.slug || "—"}
                      </p>
                    </div>
                    <Badge level={f.status === "error" ? "error" : f.status === "ready" ? "success" : "pending"}>
                      {f.status === "ready" ? "ready" : f.status}
                    </Badge>
                    <button onClick={() => removeFile(f.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setFiles([]); setExistingSite(null); }}
                  className="text-sm hover:text-red-400 transition-colors"
                  style={{ color: "#6a6a8a" }}
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Nav */}
            <div className="flex justify-end pt-2">
              <button
                onClick={goNext}
                disabled={!canProceed}
                className="px-6 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-40"
                style={{ background: canProceed ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "#2a2a4a", color: "#fff" }}
              >
                Continue to Configure <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 1: CONFIGURE ═══ */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white">Configure Your Blog</h2>
              <p className="text-sm mt-1" style={{ color: "#7a7a9a" }}>
                These settings generate your <span className="font-mono text-purple-400">hugo.toml</span> and GitHub Pages URL
              </p>
              {!hasGithubConfig && !existingSite && (
                <div className="mt-3 mx-auto max-w-lg flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs"
                  style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", color: "#f0c060" }}>
                  <Info size={14} className="flex-shrink-0" />
                  <span>When GitHub username and repository name are empty, <span className="font-mono">hugo.toml</span>, <span className="font-mono">go.mod</span>, and site scaffolding will not be generated. You can still download transformed posts.</span>
                </div>
              )}
            </div>

            <div className="space-y-5 max-w-lg mx-auto">
              {/* Blog Name */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-gray-300">
                  <BookOpen size={14} className="text-purple-400" />
                  Blog Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={config.blogName}
                  onChange={(e) => setConfig((c) => ({ ...c, blogName: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-purple-500/50"
                  style={{ background: "rgba(20, 20, 40, 0.6)", border: "1px solid rgba(120, 100, 200, 0.2)" }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-gray-300">
                  <FileText size={14} className="text-purple-400" />
                  Description
                </label>
                <input
                  type="text"
                  value={config.description}
                  onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-purple-500/50"
                  style={{ background: "rgba(20, 20, 40, 0.6)", border: "1px solid rgba(120, 100, 200, 0.2)" }}
                />
              </div>

              {/* Author */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-gray-300">
                  <User size={14} className="text-purple-400" />
                  Author Name
                </label>
                <input
                  type="text"
                  value={config.author}
                  onChange={(e) => setConfig((c) => ({ ...c, author: e.target.value }))}
                  placeholder="Your Name"
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-purple-500/50"
                  style={{ background: "rgba(20, 20, 40, 0.6)", border: "1px solid rgba(120, 100, 200, 0.2)" }}
                />
              </div>

              {/* GitHub Username */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-gray-300">
                  <Globe size={14} className="text-purple-400" />
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={config.githubUsername}
                  onChange={(e) => setConfig((c) => ({ ...c, githubUsername: e.target.value }))}
                  placeholder="username"
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-purple-500/50"
                  style={{ background: "rgba(20, 20, 40, 0.6)", border: "1px solid rgba(120, 100, 200, 0.2)" }}
                />
                <p className="text-xs mt-1" style={{ color: "#5a5a7a" }}>Used to generate your blog URL</p>
              </div>

              {/* Repo Name */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-gray-300">
                  <Globe size={14} className="text-purple-400" />
                  Repository Name
                </label>
                <input
                  type="text"
                  value={config.repoName}
                  onChange={(e) => setConfig((c) => ({ ...c, repoName: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-purple-500/50"
                  style={{ background: "rgba(20, 20, 40, 0.6)", border: "1px solid rgba(120, 100, 200, 0.2)" }}
                />
                <p className="text-xs mt-1" style={{ color: "#5a5a7a" }}>The GitHub repo for your blog</p>
              </div>

              {/* URL Preview */}
              {config.githubUsername && (
                <div className="px-4 py-3 rounded-lg" style={{ background: "rgba(120, 100, 200, 0.1)", border: "1px solid rgba(120, 100, 200, 0.15)" }}>
                  <p className="text-xs mb-1" style={{ color: "#7a7a9a" }}>Your blog will be published at:</p>
                  <p className="text-sm font-mono text-purple-400">{blogUrl}</p>
                </div>
              )}

              {/* LaTeX alternative toggles */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-medium" style={{ color: "#7a7a9a" }}>LaTeX Options</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setConfig((c) => ({ ...c, useAltDelimiters: !c.useAltDelimiters }))}
                    className={`w-10 h-5 rounded-full transition-all flex items-center ${
                      config.useAltDelimiters ? "justify-end" : "justify-start"
                    }`}
                    style={{
                      background: config.useAltDelimiters ? "#7c3aed" : "#2a2a4a",
                      padding: "2px",
                    }}
                  >
                    <div className="w-4 h-4 rounded-full bg-white transition-all" />
                  </button>
                  <span className="text-sm text-gray-300">Use <span className="font-mono text-purple-400">$$$$</span> for display math blocks</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setConfig((c) => ({ ...c, useAltLineBreaks: !c.useAltLineBreaks }))}
                    className={`w-10 h-5 rounded-full transition-all flex items-center ${
                      config.useAltLineBreaks ? "justify-end" : "justify-start"
                    }`}
                    style={{
                      background: config.useAltLineBreaks ? "#7c3aed" : "#2a2a4a",
                      padding: "2px",
                    }}
                  >
                    <div className="w-4 h-4 rounded-full bg-white transition-all" />
                  </button>
                  <span className="text-sm text-gray-300">Use <span className="font-mono text-purple-400">\\\\</span> for line breaks in math</span>
                </div>
              </div>

              {/* Remember */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setRemember((r) => !r)}
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                    remember ? "bg-purple-600 border-purple-500" : "border-gray-600"
                  }`}
                >
                  {remember && <Check size={12} color="#fff" />}
                </button>
                <span className="text-sm text-gray-400">Remember GitHub username & repo name</span>
              </div>
            </div>

            {/* Nav */}
            <div className="flex justify-between pt-4">
              <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={goNext}
                disabled={!canProceed}
                className="px-6 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-40"
                style={{ background: canProceed ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "#2a2a4a", color: "#fff" }}
              >
                Transform & Preview <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: PREVIEW ═══ */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                <Check size={14} />
                {transformedFiles.length}/{files.length} transformed
              </span>
              {warningCount > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-amber-400">
                  <AlertTriangle size={14} />
                  {warningCount} warning{warningCount > 1 ? "s" : ""}
                </span>
              )}
              {infoCount > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-blue-400">
                  <Info size={14} />
                  {infoCount} notice{infoCount > 1 ? "s" : ""}
                </span>
              )}
              <div className="flex-1" />
              <div className="flex items-center gap-2 text-sm" style={{ color: "#7a7a9a" }}>
                <button onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))} disabled={previewIndex === 0} className="disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                {previewIndex + 1} / {files.length}
                <button onClick={() => setPreviewIndex((i) => Math.min(files.length - 1, i + 1))} disabled={previewIndex >= files.length - 1} className="disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* File tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {files.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setPreviewIndex(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    i === previewIndex ? "text-white" : "text-gray-500 hover:text-gray-300"
                  }`}
                  style={i === previewIndex ? { background: "rgba(120, 100, 200, 0.25)", border: "1px solid rgba(120, 100, 200, 0.3)" } : { border: "1px solid transparent" }}
                >
                  <FileText size={12} />
                  {f.name.replace(/\.md$/i, "")}
                  {f.warnings.length > 0 && (
                    <span className="w-2 h-2 rounded-full" style={{ background: f.warnings.some((w) => w.level === "error" || w.level === "warning") ? "#f59e0b" : "#3b82f6" }} />
                  )}
                </button>
              ))}
            </div>

            {/* Slug & target directory editor */}
            {files[previewIndex] && (
              <div className="flex items-center gap-3 flex-wrap">
                <Edit3 size={14} style={{ color: "#7a7a9a" }} />
                <span className="text-xs" style={{ color: "#7a7a9a" }}>Slug:</span>
                <input
                  type="text"
                  value={files[previewIndex].slug}
                  onChange={(e) => updateSlug(files[previewIndex].id, e.target.value)}
                  className="flex-1 max-w-xs px-3 py-1.5 rounded text-xs font-mono text-white outline-none focus:ring-1 focus:ring-purple-500/50"
                  style={{ background: "rgba(20, 20, 40, 0.6)", border: "1px solid rgba(120, 100, 200, 0.2)" }}
                />
                {existingSite && existingSite.contentDirs.length > 0 && (
                  <>
                    <FolderOpen size={14} style={{ color: "#7a7a9a" }} />
                    <span className="text-xs" style={{ color: "#7a7a9a" }}>Directory:</span>
                    <select
                      value={files[previewIndex].targetDir}
                      onChange={(e) => updateTargetDir(files[previewIndex].id, e.target.value)}
                      className="px-3 py-1.5 rounded text-xs font-mono text-white outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer"
                      style={{ background: "rgba(20, 20, 40, 0.6)", border: "1px solid rgba(120, 100, 200, 0.2)" }}
                    >
                      {existingSite.contentDirs.map((dir) => (
                        <option key={dir} value={dir} style={{ background: "#1a1a2e" }}>
                          content/{dir}/
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {!existingSite && (
                  <span className="text-xs font-mono" style={{ color: "#5a5a7a" }}>→ content/posts/</span>
                )}
              </div>
            )}

            {/* Split pane */}
            {files[previewIndex] && (() => {
              const orig = files[previewIndex].originalContent || "";
              const trans = files[previewIndex].transformedContent || files[previewIndex].originalContent || "";
              const diff = files[previewIndex].transformedContent ? computeLineDiff(orig, trans) : null;
              return (
                <div className="flex gap-4" style={{ minHeight: "400px" }}>
                  <CodePreview
                    content={orig}
                    label="Original — Obsidian Markdown"
                    markers={diff?.origMarkers}
                  />
                  <CodePreview
                    content={trans}
                    label="Transformed — Hugo Markdown"
                    markers={diff?.transMarkers}
                  />
                </div>
              );
            })()}

            {/* Warnings for current file */}
            {files[previewIndex]?.warnings.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#9a9ab0" }}>
                  <AlertTriangle size={13} />
                  Messages for {files[previewIndex].name}
                </p>
                {files[previewIndex].warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                    style={{
                      background: w.level === "error" ? "rgba(239,68,68,0.1)" :
                                  w.level === "warning" ? "rgba(245,158,11,0.1)" :
                                  w.level === "info" ? "rgba(59,130,246,0.1)" :
                                  "rgba(139,92,246,0.1)",
                      border: `1px solid ${
                        w.level === "error" ? "rgba(239,68,68,0.2)" :
                        w.level === "warning" ? "rgba(245,158,11,0.2)" :
                        w.level === "info" ? "rgba(59,130,246,0.2)" :
                        "rgba(139,92,246,0.2)"
                      }`,
                    }}
                  >
                    <Badge level={w.level}>{w.level}</Badge>
                    <span style={{ color: "#c0c0d0" }}>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Nav */}
            <div className="flex justify-between pt-4">
              <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={goNext}
                className="px-6 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff" }}
              >
                Continue to Download <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: DOWNLOAD ═══ */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Your Hugo Site is Ready</h2>
              <p className="text-sm mt-1" style={{ color: "#7a7a9a" }}>
                {transformedFiles.length} post{transformedFiles.length !== 1 ? "s" : ""} transformed
              </p>
            </div>

            {/* Download buttons */}
            <div className="grid grid-cols-2 gap-4">
              {/* Complete site */}
              <div
                className={`rounded-xl p-6 text-center transition-all ${canGenerateSite ? "hover:scale-[1.02]" : "opacity-50"}`}
                style={{ ...cardStyle, border: siteBase64 ? "1px solid rgba(120, 100, 200, 0.4)" : cardStyle.border }}
              >
                <FolderArchive size={32} className="mx-auto mb-3" style={{ color: canGenerateSite ? "#7c8cf0" : "#4a4a6a" }} />
                <p className="font-semibold text-white text-sm mb-1">Download Complete Site</p>
                <p className="text-xs mb-3" style={{ color: "#6a6a8a" }}>Hugo config + posts + GitHub Actions</p>

                {!canGenerateSite ? (
                  <p className="text-xs px-3" style={{ color: "#8a6a3a" }}>
                    GitHub username and repository name are required to generate a complete site.
                  </p>
                ) : (
                  <>
                    {/* TOML preserve/replace toggle — only when existing site uploaded */}
                    {existingSite && existingSite.hugoTomlRaw && (
                      <div className="mb-4 mx-auto max-w-xs text-left">
                        <p className="text-xs font-medium mb-2" style={{ color: "#7a7a9a" }}>hugo.toml handling:</p>
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="tomlMode"
                              checked={preserveToml}
                              onChange={() => { setPreserveToml(true); setSiteBase64(null); }}
                              className="accent-purple-500"
                            />
                            <span className="text-xs text-gray-300">Preserve original hugo.toml</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="tomlMode"
                              checked={!preserveToml}
                              onChange={() => { setPreserveToml(false); setSiteBase64(null); }}
                              className="accent-purple-500"
                            />
                            <span className="text-xs text-gray-300">Replace with generated hugo.toml</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {siteBase64 ? (
                      <a
                        href={`data:application/zip;base64,${siteBase64}`}
                        download={`${slugify(config.blogName || "my-blog")}-hugo-site.zip`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
                      >
                        <ArrowDownToLine size={14} /> Download .zip
                      </a>
                    ) : (
                      <button
                        onClick={generateDownloads}
                        disabled={zipLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
                      >
                        {zipLoading ? "Generating..." : "Generate .zip"}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Posts only */}
              <div className="rounded-xl p-6 text-center transition-all hover:scale-[1.02]" style={cardStyle}>
                <FileText size={32} className="mx-auto mb-3" style={{ color: "#7c8cf0" }} />
                <p className="font-semibold text-white text-sm mb-1">Download Posts Only</p>
                <p className="text-xs mb-4" style={{ color: "#6a6a8a" }}>Transformed .md file{transformedFiles.length > 1 ? "s" : ""} for existing sites</p>
                {transformedFiles.length === 1 && transformedFiles[0].transformedContent ? (
                  <a
                    href={`data:text/markdown;base64,${textToBase64(transformedFiles[0].transformedContent)}`}
                    download={`${transformedFiles[0].slug || "post"}.md`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ background: "rgba(120, 100, 200, 0.3)", border: "1px solid rgba(120, 100, 200, 0.3)" }}
                  >
                    <ArrowDownToLine size={14} /> Download .md
                  </a>
                ) : postsBase64 ? (
                  <a
                    href={`data:application/zip;base64,${postsBase64}`}
                    download="transformed-posts.zip"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ background: "rgba(120, 100, 200, 0.3)", border: "1px solid rgba(120, 100, 200, 0.3)" }}
                  >
                    <ArrowDownToLine size={14} /> Download .zip
                  </a>
                ) : transformedFiles.length > 1 ? (
                  <button
                    onClick={generateDownloads}
                    disabled={zipLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "rgba(120, 100, 200, 0.3)", border: "1px solid rgba(120, 100, 200, 0.3)" }}
                  >
                    {zipLoading ? "Generating..." : "Generate .zip"}
                  </button>
                ) : (
                  <p className="text-xs text-gray-500">No posts available</p>
                )}
              </div>
            </div>

            {/* Deploy Instructions — only shown when site generation is possible */}
            {canGenerateSite && (
            <div className="rounded-xl overflow-hidden" style={cardStyle}>
              <div className="px-5 py-3 font-semibold text-sm text-white" style={{ background: "rgba(30, 30, 55, 0.8)" }}>
                Deploy to GitHub Pages
              </div>
              <div className="p-5 space-y-6">
                {/* Step 1 */}
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: "rgba(120, 100, 200, 0.2)", color: "#a78bfa" }}>1</div>
                  <div>
                    <p className="font-medium text-white text-sm">Create a new GitHub repository</p>
                    <p className="text-xs mt-0.5" style={{ color: "#7a7a9a" }}>
                      Create a new repo named "{config.repoName || "my-blog"}" at{" "}
                      <span className="text-purple-400">github.com/new</span>
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: "rgba(120, 100, 200, 0.2)", color: "#a78bfa" }}>2</div>
                  <div className="flex-1">
                    <p className="font-medium text-white text-sm">Extract and push the zip</p>
                    <p className="text-xs mt-0.5 mb-3" style={{ color: "#7a7a9a" }}>Unzip the downloaded file and push to your new repo:</p>
                    <div className="relative rounded-lg overflow-hidden" style={{ background: "#0c0c18" }}>
                      <pre className="p-4 text-xs leading-relaxed overflow-x-auto" style={{ color: "#b0b0d0" }}>
                        <code>{gitCommands}</code>
                      </pre>
                      <button
                        onClick={() => copyToClipboard(gitCommands)}
                        className="absolute top-2 right-2 p-1.5 rounded transition-colors"
                        style={{ background: "rgba(120, 100, 200, 0.2)" }}
                        title="Copy commands"
                      >
                        {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} color="#7a7a9a" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: "rgba(120, 100, 200, 0.2)", color: "#a78bfa" }}>3</div>
                  <div>
                    <p className="font-medium text-white text-sm">Enable GitHub Pages</p>
                    <p className="text-xs mt-0.5" style={{ color: "#7a7a9a" }}>
                      In your repo's Settings → Pages, set source to 'GitHub Actions'. The included workflow will handle the rest automatically.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: "rgba(120, 100, 200, 0.2)", color: "#a78bfa" }}>4</div>
                  <div>
                    <p className="font-medium text-white text-sm">Visit your blog</p>
                    <p className="text-xs mt-0.5" style={{ color: "#7a7a9a" }}>
                      After the first workflow run completes (~2 minutes), visit:
                    </p>
                    <p className="text-sm font-mono mt-1 text-purple-400 flex items-center gap-1.5">
                      {blogUrl} <ExternalLink size={12} />
                    </p>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Nav */}
            <div className="flex justify-start pt-2">
              <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={16} /> Back to Preview
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
