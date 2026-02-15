# PRD: Obsidian2Hugo

## Project Overview

### Vision

Obsidian2Hugo is a **Claude Artifact-based** web application that bridges the gap between Obsidian note-taking and Hugo static site blogging. It provides a zero-friction workflow for content creators to transform their Obsidian markdown notes into production-ready Hugo blog posts, eliminating manual syntax conversion and configuration overhead. The tool delivers a complete, deployment-ready Hugo repository as a downloadable zip, enabling users to go from local notes to published blog in minutes — all within a single Claude Artifact with no external services required.

### Target Users
- **Obsidian power users** who want to publish their notes as blog posts without manual markdown syntax conversion
- **Technical bloggers** seeking a streamlined workflow from writing to deployment with minimal configuration
- **Knowledge workers** maintaining personal knowledge bases in Obsidian who want to selectively publish content as static blogs
- **Students and researchers** documenting learning journeys or sharing technical insights through Hugo-powered sites
- **Content creators** preferring local-first writing in Obsidian with the flexibility of static site publishing

## Core Features

### MVP (Phase 1)

#### 1. Obsidian Markdown Transformation Engine
- **Wikilink Resolution**
  - Convert `[[note-name]]` to Hugo-compatible relative paths (`/posts/note-name-slug/`)
  - Handle `[[note-name|display text]]` alias syntax, preserving display text while linking to correct slug
  - Two-pass processing: build slug map from all uploaded files, then resolve cross-references
  - Handle nested folders and maintain link integrity across batch uploads
- **Image Embed Conversion**
  - Transform Obsidian syntax `![[image.png]]` to standard markdown `![](image.png)`
  - Generate `static/images/` folder with README instructions for manual image placement
- **Tag Extraction and Front Matter Generation**
  - Extract Obsidian tags (`#tag`) and convert to Hugo front matter tags array
  - Auto-generate title from filename or first H1 heading
  - Set `date` to current timestamp and `draft` to false if front matter doesn't exist
  - Merge existing front matter with sensible defaults (preserve user-defined fields)
- **LaTeX Math Syntax Normalization**
  - Detect Obsidian math blocks (`$inline$`, `$$display$$`)
  - Transform to Hugo-compatible format with `math = true` and `mathjax = true` parameters
  - Handle edge cases where Obsidian LaTeX syntax differs from Hugo/MathJax requirements:
    - Escape unescaped asterisks inside math regions (protect LaTeX environment markers like `\begin{align*}`)
    - Isolate display math `$$` onto their own lines with blank-line separation
    - Add spacing inside and outside inline math delimiters (`$content$` → `$ content $`)
    - Replace `flalign`/`flalign*` environments with `align`/`align*`
    - Merge lines starting with `=` onto previous line to prevent setext H1 heading interpretation
    - Remove empty lines inside display math blocks to prevent Goldmark from breaking out of math mode
    - Optional alternative `$$$$` delimiters and `\\\\` line breaks
  - Configure Goldmark passthrough delimiters for `$$`, `$`, `\[`, `\]`, `\(`, `\)` in generated `hugo.toml`

#### 2. Batch File Processing with Live Preview
- **Multi-File Upload Interface**
  - Drag-and-drop zone accepting multiple `.md` files simultaneously
  - File list display with size, status indicators (pending/processing/completed)
- **Real-Time Preview Pane**
  - Split-pane layout: original Obsidian markdown (left) vs. transformed Hugo markdown (right)
  - Syntax-differentiated display using styled `<pre>` / `<code>` blocks with Tailwind typography
  - Tab switcher for navigating between multiple files in batch
  - Line-level diff highlighting to show changes between original and transformed content
- **Validation and Error Handling**
  - Detect broken wikilinks and display warnings (continue with best-effort transformation)
  - Flag LaTeX syntax that may not render correctly
  - Show file name conflicts with warnings
  - Non-blocking warnings: allow download even with issues, user decides on fixes

#### 3. Hugo Scaffold Generation with PaperMod Theme
- **Zero-Config Blog Structure**
  - Generate complete Hugo directory structure: `content/posts/`, `static/images/`, `hugo.toml`, `go.mod`, `.github/workflows/`
  - PaperMod theme integration via Hugo Module (defined in `hugo.toml` `[module]` section, installed via `hugo mod get` in GitHub workflow)
  - Pre-configured `hugo.toml` with:
    - PaperMod theme settings (reading time, nav links, breadcrumbs, code copy, TOC)
    - Math rendering enabled via Goldmark passthrough extensions with `$$`, `$`, `\[`, `\(` delimiters
    - GitHub Pages base URL template (user-customizable)
- **GitHub Actions Workflow Template**
  - Auto-generated `.github/workflows/hugo.yml` with:
    - Trigger: push to `main` branch
    - Hugo version pinned to `v0.155.3`
    - Go 1.23 setup for Hugo Modules
    - PaperMod theme installation via `hugo mod get`
    - Build and deploy via `actions/deploy-pages` (GitHub Actions source)
- **Post-Download Instructions**
  - Display step-by-step guide for creating GitHub repository
  - Detailed instructions for enabling GitHub Pages (Settings → Code and automation → Pages → Build and deployment → GitHub Actions)
  - Show expected URL: `https://{username}.github.io/{repo-name}/`

#### 4. Upload & Download Delivery Workflow
- **Primary Input: Obsidian Markdown Files**
  - Accept individual `.md` files or multiple files via drag-and-drop upload
  - Read file contents in-browser using the File API
- **Primary Output: Complete Hugo Site Zip**
  - In-memory zip generation using JSZip (loaded via CDN: `cdnjs.cloudflare.com`)
  - Bundle all transformed markdown posts, config files, workflow, and folder structure
  - Downloadable as `{blog-name}-hugo-site.zip` (typically 50–500KB for small blogs)
  - Download via base64-encoded data URI with declarative `<a>` tag (required by Artifact sandbox CSP — Blob URLs are blocked)
- **Alternative: Individual Markdown File Download**
  - Optional "Download Transformed Files Only" button for users who want manual control
  - Outputs individual `.md` files with Hugo-compatible front matter (single file) or zip (multiple files)
  - Useful for appending to existing Hugo sites without full scaffolding

#### 5. Existing Blog Update Workflow
- **Repo Upload and Merge**
  - Accept existing Hugo site as an uploaded zip file
  - Smart root detection: auto-strip single-folder zip wrappers
  - Parse directory structure in-browser and detect all `content/` subdirectories
  - Identify existing posts to avoid filename conflicts
  - Merge new transformed posts into existing structure with per-file target directory selection
  - Preserve existing `hugo.toml` settings (with preserve/replace toggle)
- **Configuration Auto-Fill**
  - Section-aware TOML parser extracts blog name, description, author, GitHub username, repo name, and LaTeX settings from uploaded `hugo.toml`
  - Fallback extraction of GitHub username/repo from `go.mod` (for custom-domain sites)
  - Change detection warnings when user modifies auto-filled values (dismissible top banner + inline per-field alerts)
- **Conflict Detection**
  - Detect duplicate post filenames and display overwrite warnings
  - Maintain existing front matter for unchanged posts

#### 6. In-Memory State Architecture
- **React State as Single Source of Truth**
  - All application state managed via `useState` within the Artifact component
  - Active file contents (File objects, raw text, transformed output)
  - Wikilink resolution map (filename → slug mapping)
  - Preview pane rendered content
  - Blog configuration: blog name, description, author, GitHub username, repo name, LaTeX options
  - State resets on Artifact remount (no persistence across sessions)
- **No Browser Storage APIs**
  - Claude Artifacts do not support `localStorage` or `sessionStorage`; all state is ephemeral and held in React state
  - Users are informed that refreshing the page or closing the tab will reset all progress
- **Optional Persistent Storage (via `window.storage` API)**
  - Store user preferences (GitHub username, repo name) using the Artifact persistent storage API
  - All stored values are JSON-serialized; keys follow `obsidian2hugo:{category}` naming convention

### Phase 2 (Future Enhancements)

#### 1. Advanced Obsidian Syntax Support
- **Callouts and Admonitions**
  - Transform Obsidian callout blocks (`> [!note]`, `> [!warning]`) to Hugo shortcodes
  - Support custom callout types with color/icon mappings
  - Generate shortcode templates in Hugo scaffold if detected
- **Embedded Content**
  - Support audio/video embeds (`![[video.mp4]]`)
  - Convert to Hugo figure shortcodes with proper paths

#### 2. Image and Asset Management
- **Image Reference Validation**
  - Validate image references in markdown and warn about missing files
- **Drag-and-Drop Image Bundling**
  - Accept image files alongside markdown uploads
  - Auto-place images in `static/images/` folder within the generated zip
  - Update markdown image references to match Hugo static folder structure
  - Support bulk image optimization (compression, WebP conversion via canvas API)
- **Base64 Inline Image Handling**
  - Detect base64-encoded images in markdown
  - Extract and save as separate files in static folder
  - Replace inline data with proper image references

#### 3. Advanced Preview and Export
- **Rendered Markdown Preview**
  - Render transformed markdown as styled HTML within the Artifact for visual verification
  - Approximate PaperMod theme appearance using Tailwind typography styles
  - Navigate between posts in preview mode
- **Export / Import Project State**
  - Download complete project state as JSON (all uploaded files + config + transformation results)
  - "Import Project" button to resume work from a previously exported JSON file
  - Useful for iterative editing without re-uploading files

#### 4. Multi-Theme Support
- **Theme Selector**
  - Offer PaperMod, Ananke, Hermit, Stack as pre-configured options
  - Generate theme-specific `hugo.toml` configurations
  - Preview theme appearance before download
- **Custom Theme Import**
  - Allow users to upload their own Hugo theme config snippet
  - Auto-detect theme configuration requirements
  - Merge custom theme settings into generated scaffold

#### 5. Batch Post Management Dashboard
- **Post Metadata Editor**
  - Bulk edit front matter across multiple posts (tags, categories, dates)
  - Tag auto-complete and taxonomy suggestions
  - Date range picker for scheduled publishing
- **Content Organization**
  - Drag-and-drop post reordering
  - Folder/section assignment for Hugo content organization
  - Batch rename posts with consistent naming patterns

#### 6. Enhanced Conflict Resolution
- **Duplicate Filename Auto-Rename**
  - Suggest auto-renaming for duplicate filenames (append timestamp or slug variant)
- **Side-by-Side Overwrite Comparison**
  - Show side-by-side comparison when overwriting an existing post in the uploaded Hugo site
- **Repo Name Validation**
  - Warn users to avoid using `{username}.github.io` as repo name (reserved for root GitHub Pages site)

## Technical Architecture

### Technology Stack
- **Runtime Environment**: Claude Artifact (single-file React JSX component)
- **UI Framework**: React 18 (hooks-based) with Tailwind CSS utility classes
- **Markdown Processing**: Custom in-component parsing logic
  - Regex-based front matter extraction and YAML generation
  - Custom wikilink resolver (two-pass: slug map build → link rewrite)
  - LaTeX delimiter normalizer with display math isolation, inline spacing, environment replacement, `=` line merging, and empty line removal
  - Tag extractor (`#tag` → front matter array)
  - Section-aware TOML parser for existing site config extraction
- **File Operations**: JSZip loaded via CDN (`https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`) for in-memory zip archive creation and reading
- **Download Mechanism**: Base64-encoded data URIs with `TextEncoder` for UTF-8 handling, rendered as declarative `<a>` tags (Blob URLs are blocked by Artifact sandbox CSP)
- **Icons**: lucide-react for UI iconography
- **State Management**: React `useState` (all in-memory, no browser storage)
- **Persistent Preferences**: `window.storage` API (Artifact-native key-value store)

### Deployment
- **Hosting**: Delivered as a Claude Artifact — no separate deployment, CI/CD, or hosting infrastructure required
- **Distribution**: Users interact with the tool directly within Claude's chat interface; the Artifact renders inline

### Platform Compatibility
- Runs in any environment that supports Claude Artifacts (claude.ai web app, Claude mobile app)
- Underlying requirement: modern browser with ES2020+ support (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Required browser APIs: File API (for upload), base64/data URI support (for download)

### Constraints Imposed by Artifact Environment
- **Single-file architecture**: All logic, UI, and styles must reside in one `.jsx` file
- **No `localStorage` / `sessionStorage`**: State is ephemeral; use React state or `window.storage` only
- **No Blob URLs**: CSP blocks `blob:` URLs; downloads must use base64-encoded data URIs with declarative `<a>` tags
- **Limited external imports**: Only libraries available in Claude Artifacts or loadable from `cdnjs.cloudflare.com`
- **No backend / no network requests**: All processing happens client-side in the browser
- **No Node.js modules**: Cannot use `remark`, `unified`, or other npm-only packages directly; must reimplement necessary parsing logic or use CDN-available alternatives

## Success Metrics

### MVP Success Criteria
- **Conversion Accuracy**: >95% successful transformation of common Obsidian syntax (wikilinks, tags, images, LaTeX)
- **Performance**: Batch process markdown files in under 10 seconds within the Artifact
- **User Completion Rate**: >70% of users who upload files successfully download the Hugo zip
- **Error Recovery**: <5% of sessions require user intervention due to unhandled errors

### User Satisfaction Goals
- **Time to First Blog**: <15 minutes from opening the Artifact to a downloadable Hugo site zip
- **Documentation Clarity**: Post-download instructions are sufficient for users to deploy without external help
- **Feature Adoption**: >50% of users utilize batch upload (not just single file)

## Risks and Mitigation

### Technical Risks
- **Risk**: Obsidian syntax variations causing incomplete transformations
  - **Mitigation**: Implement best-effort transformation with detailed warnings, provide manual fix instructions
- **Risk**: Large file batches causing browser performance issues within the Artifact
  - **Mitigation**: Show warning at 5MB upload threshold, suggest splitting into multiple batches; process files sequentially to avoid UI freezes
- **Risk**: Hugo version incompatibilities breaking generated sites
  - **Mitigation**: Pin Hugo v0.155.3 explicitly in generated workflow, document upgrade path in README
- **Risk**: Custom markdown parsing (without remark/unified) missing edge cases
  - **Mitigation**: Prioritize the most common Obsidian patterns (wikilinks, tags, images, LaTeX); document unsupported syntax clearly; iterate based on user feedback
- **Risk**: JSZip CDN unavailability or loading failure
  - **Mitigation**: Provide fallback "Download Individual Files" option that doesn't require JSZip; show clear error message if CDN load fails

### User Experience Risks
- **Risk**: Users expect persistent state but Artifact resets on remount
  - **Mitigation**: Prominent notice that progress is not saved on refresh
- **Risk**: Manual image placement confuses non-technical users
  - **Mitigation**: Generate detailed README in `static/images/` with step-by-step instructions and examples
- **Risk**: Users unfamiliar with Hugo deployment steps after download
  - **Mitigation**: Include comprehensive post-download instruction panel within the Artifact UI, covering GitHub repo creation, Pages setup, and first deployment

## Out of Scope (Not Included)

- Multi-user accounts and authentication
- Server-side processing or backend database
- Real-time collaboration or multi-device sync
- Obsidian plugin installation or direct Obsidian API integration
- WYSIWYG markdown editor (only preview, no in-app editing)
- Automated Hugo hosting beyond GitHub Pages (Netlify, Vercel integrations)
- Content management dashboard for published blogs (focus is on pre-publish transformation)
- Dataview query parsing or other advanced Obsidian plugin syntax
- Direct GitHub API integration or repository push (all delivery is via file download)
