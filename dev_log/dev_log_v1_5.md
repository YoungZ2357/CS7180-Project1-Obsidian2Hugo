# Dev Log

**Artifact**: Obsidian2Hugo-v1_5.jsx

## Previous Stage

v1.4 MVP — All features from v1.3 plus: section-aware TOML parser, `go.mod` fallback parsing, full auto-fill on existing site upload, change detection warnings (top banner + inline per-field), display math isolation, inline math spacing, `flalign` → `align` replacement, LaTeX environment asterisk protection, setext H1 heading prevention (leading `=` merge), extended passthrough delimiters (`\[`, `\]`, `\(`, `\)` alongside `$$`, `$`), and empty line removal inside display math.

## Current Stage

v1.5 MVP — All features from v1.4 preserved. Enhanced with:

1. **Unified file drop zone**: The upload zone now accepts both `.md` markdown files and image files (png, jpg, jpeg, gif, webp, svg, bmp, tiff) simultaneously. A single `handleFiles` callback routes files to the appropriate state (markdown → `files`, images → `imageFiles`). The `<input>` accept attribute and drop handler both support the combined file types.

2. **Image reference extraction**: New `extractImageReferences()` function scans markdown text for both Obsidian embed syntax (`![[image.ext]]`, `![[subfolder/image.ext]]`) and standard markdown syntax (`![alt](image.ext)`, `![alt](subfolder/image.ext)`). References are flattened to filename-only (subdirectories stripped). External URLs (`https://...`) and already-absolute Hugo paths (`/images/...`) are excluded from detection.

3. **Image flatten collision detection**: New `detectImageFlattenCollisions()` function identifies cases where different subdirectory paths flatten to the same filename (e.g., `a/photo.png` and `b/photo.png` both → `photo.png`). Collision warnings are generated per-file during transformation.

4. **Image reference summary**: In the Upload step, a summary panel shows the total count of referenced images across all markdown files, how many are matched by uploaded images, how many are missing, and how many uploaded images are orphaned (not referenced by any file). Missing and orphan lists show up to 5 names with overflow count.

5. **Image path rewriting**: `transformImageEmbeds()` rewritten to handle both syntaxes and produce Hugo-compatible absolute paths with repository name prefix:
   - `![[image.png]]` → `![](/{repoName}/images/image.png)`
   - `![[subfolder/image.png]]` → `![](/{repoName}/images/image.png)` (flattened)
   - `![alt](image.png)` → `![alt](/{repoName}/images/image.png)`
   - `![alt](subfolder/image.png)` → `![alt](/{repoName}/images/image.png)` (flattened)
   - Falls back to `/images/{filename}` when `repoName` is empty.
   - External URLs and already-resolved paths (containing `/images/`) left untouched.
   - Wikilink transformer's fallback image catch also updated to use repo-prefixed paths.
   - New `imageBasePath(repoName)` helper centralizes path prefix logic.

6. **Image bundling in zip output**: `generateSiteZip()` now accepts an `imageFiles` parameter. All uploaded image files are placed in `static/images/{filename}` within the generated Hugo site zip. The `IMAGES_README` is updated to reflect bundled images.

7. **Output path conflict enforcement (Preview step)**: New `pathConflicts` memo computes full output paths (`content/{targetDir}/{slug}.md`) for all transformed files and detects two conflict types:
   - **New ↔ New**: Multiple uploaded files resolve to the same output path.
   - **New ↔ Existing**: A new file's output path matches an existing post in the uploaded repo zip.
   Both types block the "Continue to Download" button. Conflicts are indicated by red badges on file tabs, red-highlighted slug input fields, and per-file inline error messages explaining the conflict and how to resolve it (edit slug or target directory). A summary banner at the bottom of the Preview step shows total conflict counts.

8. **Missing image warnings per-file**: In the Preview step, each file's warnings section includes dynamically computed missing image warnings based on that file's image references vs. the set of uploaded images. These are non-blocking (informational only).

9. **Image file management UI**: Image files are displayed in the Upload step file list with a distinct icon (FileImage, green-tinted), showing filename, size, and target path (`static/images/{name}`). Each image has an individual remove button. The "Clear all" button resets both markdown files and images.

## Changes

- **Added** `FileImage` to lucide-react imports (for image file indicators; `Image` is reserved in the Artifact environment).
- **Added** `IMAGE_EXTENSIONS`, `IMAGE_EXT_SET`, `IMAGE_ACCEPT` constants for centralized image extension management.
- **Replaced** `IMAGES_README` content to reflect bundled-image behavior and both Obsidian/standard markdown syntax.
- **Added** `extractImageReferences(text)`: regex-based scanner for Obsidian and standard markdown image references, returning a Set of flattened filenames. Skips external URLs and `/images/` paths.
- **Added** `detectImageFlattenCollisions(text)`: detects when subdirectory flattening produces duplicate filenames within a single file.
- **Rewrote** `transformImageEmbeds(text, repoName)`: now handles both `![[img]]` and `![alt](img)` syntaxes, rewrites all local paths to `/{repoName}/images/{filename}` (falls back to `/images/{filename}` when repoName is empty), flattens subdirectories. Uses `IMAGE_EXTENSIONS` constant for pattern generation. Skip condition uses `/\/images\//` regex to catch both `/images/` and `/{repo}/images/` patterns.
- **Added** `imageBasePath(repoName)` helper: returns `/{repoName}/images` or `/images` based on repoName availability.
- **Updated** `transformWikilinks(text, slugMap, repoName)`: accepts `repoName` parameter, fallback image catch uses `imageBasePath()` for consistent repo-prefixed paths.
- **Added** flatten collision warnings to `transformFile()`: calls `detectImageFlattenCollisions` before image transform.
- **Added** `imageFiles` state variable (array of `{ id, name, size, data: ArrayBuffer }`).
- **Renamed** `handleMdFiles` → `handleFiles`: unified callback that routes `.md` files to `files` state and image files to `imageFiles` state. Images are read via `readAsArrayBuffer`. Deduplication by filename for images.
- **Added** `removeImage` callback for individual image removal.
- **Added** `isImageFile` helper callback.
- **Updated** drop zone: accept attribute includes image extensions, text updated to mention images, `onChange` calls `handleFiles`.
- **Added** `imageRefSummary` memo: computes allRefs, uploadedNames, missing, matched, orphan Sets across all files and uploaded images.
- **Added** `perFileImageRefs` memo: maps each file id to its Set of image references.
- **Added** `pathConflicts` memo: computes newNewConflicts and newExistingConflicts Maps (fileId → outputPath).
- **Added** `hasPathConflicts` derived boolean.
- **Updated** `canProceed` for step 2: now requires `!hasPathConflicts` (was unconditionally `true`).
- **Updated** Preview step file tabs: red background/border and red dot indicator for files with path conflicts.
- **Rewrote** Preview step slug editor: wrapped in IIFE for per-file conflict state; slug input border turns red on conflict; inline error messages for new↔new and new↔existing conflicts.
- **Rewrote** Preview step warnings section: IIFE computes per-file missing image warnings dynamically and merges with transformation warnings.
- **Added** Preview step conflict summary banner (red): shows total duplicate path and overwrite counts with resolution instructions.
- **Updated** Preview step nav button: respects `canProceed` (disabled + dimmed when conflicts exist).
- **Updated** Preview step summary bar: added conflict count (red) and image bundled count (green).
- **Updated** `generateSiteZip()`: accepts `imageFiles` parameter, bundles them into `static/images/`.
- **Updated** `generateDownloads`: passes `imageFiles` to `generateSiteZip`, added `imageFiles` to dependency array.
- **Removed** existing-site overwrite warnings from `runTransform` (now handled by blocking in Preview); removed `existingSite` from its dependency array.
- **Updated** Upload step file list: shows image files with distinct icon and styling, image reference summary panel, "Clear all" also resets `imageFiles`.
- **Updated** Download step: header shows image count, site download card description includes "images".
- **Version bump**: v1.4 → v1.5.

## User Instructions Summary

User requested two features: (1) detect filename conflicts between uploaded files and existing repository posts, requiring users to change filenames (via slug editing) before proceeding — implemented as full output path conflict enforcement at the Preview step with blocking behavior, and (2) detect image references in uploaded markdown files, allow users to upload referenced images alongside markdown files, and arrange uploaded images in the Hugo repository at `static/images/` — implemented with both Obsidian and standard markdown syntax detection, unified drop zone, image bundling in zip output, and non-blocking missing image warnings. User specified: both `![[img]]` and `![alt](img)` syntax detection, single unified drop zone, warn-but-allow for missing images, flatten subdirectories with collision warning, block on path conflicts (both new↔new and new↔existing), resolve conflicts by editing slugs, and rewrite image paths to Hugo absolute `/images/filename.png`.
