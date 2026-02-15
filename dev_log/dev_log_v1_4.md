# Dev Log

**Artifact**: Obsidian2Hugo-v1_4.jsx

## Previous Stage

v1.3 MVP — Four-step wizard (Upload → Configure → Preview → Download) with transformation engine, existing site zip upload/merge, per-file target directory selection, hugo.toml preserve/replace toggle, and line-level diff highlighting. Existing site upload parsed `hugo.toml` with a simple regex-based parser that extracted `baseURL`, `title`, `description`, and `author` at top level. Auto-filled only `blogName`, `description`, and `author` from the parsed config. No extraction of `githubUsername`/`repoName` from `baseURL` or `go.mod`. No warnings when users modified auto-filled values.

## Current Stage

v1.4 MVP — All features from v1.3 preserved. Enhanced with:

1. **Section-aware TOML parser**: `parseHugoToml()` now tracks `[section.path]` headers and extracts values at the correct nesting level — top-level (`baseURL`, `title`, `languageCode`), `[params]` (`description`, `author`), `[params.homeInfoParams]` (fallback `description`), and `[markup.goldmark.extensions.passthrough.delimiters]` (alt delimiter detection via `$$$$` in block config).

2. **`go.mod` fallback parsing**: `parseExistingSiteZip()` now reads `go.mod` and extracts `githubUsername`/`repoName` from the `module github.com/user/repo` line when `baseURL` doesn't yield them (e.g., custom domain sites).

3. **Full auto-fill on existing site upload**: All config fields are populated — `blogName`, `description`, `author`, `githubUsername`, `repoName`, and `useAltDelimiters`. A snapshot (`autoFilledConfig`) is stored for change detection.

4. **Change detection warnings in Configure step**:
   - **Top banner** (dismissible): amber notice that fields are auto-filled from existing site. Transitions to a "you are changing existing blog information" warning when any field is modified.
   - **Inline per-field** (dismissible): amber border highlight on changed inputs, with "Original: ..." text and dismiss button. Green "auto-filled" badge on fields that match their original values.

5. **Display math isolation**: `$$` delimiters are placed on their own lines with blank-line separation from surrounding content. Adjacent horizontal whitespace is consumed to prevent trailing/leading spaces. Multi-line content is preserved, excessive blank lines collapsed.

6. **Inline math spacing**: Inner content is trimmed and re-spaced (`$content$` → `$ content $`). Spaces are enforced between `$` delimiters and all adjacent characters including punctuation (e.g., `($x$)` → `( $ x $ )`).

7. **State cleanup**: Clearing all files also resets `autoFilledConfig`, `dismissedWarnings`, and `topBannerDismissed`.

8. **`flalign` → `align` replacement**: Both `\begin{flalign}` and `\begin{flalign*}` (and corresponding `\end`) are converted to `align`/`align*` environments before display math processing.

9. **LaTeX environment asterisk protection**: `\begin{...}` and `\end{...}` markers are temporarily protected from the asterisk-escaping pass to prevent `\begin{align*}` from being damaged to `\begin{align\*}`.

10. **Setext H1 heading prevention (leading `=`)**: Lines inside display math that start with `=` are merged onto the nearest previous non-empty line (e.g., `x^2\n= z^2` → `x^2 = z^2`). Consecutive `=` lines merge recursively. If `=` is on the very first line with no previous line, a leading space is added as fallback.

11. **Extended passthrough delimiters in `generateHugoToml`**: Block delimiters expanded from `[["$$", "$$"]]` to `[["$$", "$$"], ['\\[', '\\]']]`. Inline delimiters expanded from `[["$", "$"]]` to `[["$", "$"], ['\\(', '\\)']]`. This ensures Goldmark treats all math content as passthrough, providing parser-level prevention of setext heading issues and other markdown interference inside math regions.

12. **Empty line removal inside display math**: Empty lines within `$$` blocks are filtered out before any other processing to prevent Goldmark from breaking out of math mode and treating subsequent content as plain text.

## Changes

- **Replaced** `parseHugoToml()`: simple 4-regex extractor → section-aware line-by-line parser that tracks `[section]` headers. New return type includes `githubUsername`, `repoName`, `useAltDelimiters`, `languageCode`.
- **Added** `goModRaw` field to `parseExistingSiteZip` result; reads `go.mod` and falls back to it for username/repo extraction.
- **Rewrote** `handleZipUpload`: now extracts all 6 config fields from parsed config and stores an `autoFilledConfig` snapshot.
- **Added** 3 new state variables: `autoFilledConfig` (object | null), `dismissedWarnings` (Set), `topBannerDismissed` (boolean).
- **Added** 5 new derived values/callbacks: `isFieldAutoFilled`, `isFieldChanged`, `isFieldWarningVisible`, `dismissFieldWarning`, `hasAnyAutoFill`, `hasAnyVisibleChange`.
- **Rewrote** Configure step UI: each text input now has conditional amber border, "auto-filled" badge, and inline change warning with dismiss. Top-level banner with two states (initial notice vs. change warning). LaTeX alt delimiter toggle also shows auto-filled badge and change warning.
- **Updated** "Clear all" button to reset auto-fill state.
- **Added** `AlertCircle` to lucide-react imports.
- **Rewrote** `transformLatex()` display math processing: `$$` delimiters are now isolated onto their own lines with blank-line separation from surrounding content. Display regex consumes adjacent horizontal whitespace (`[ \t]*`) to prevent trailing/leading spaces on surrounding text. Excessive blank lines collapsed via `\n{3,}` → `\n\n`.
- **Rewrote** `transformLatex()` inline math processing: inner content is trimmed and re-spaced (`$content$` → `$ content $`). Space is injected between the preceding non-whitespace character and opening `$`. A post-processing pass adds space after closing `$` when followed by any non-whitespace character including punctuation.
- **Added** `flalign` → `align` replacement: regex pass `/\\(begin|end)\{flalign(\*?)\}/g` runs before display math processing, converting both starred and unstarred variants.
- **Added** LaTeX environment protection in display math: `\begin{...}`/`\end{...}` markers are saved to placeholders before asterisk escaping and restored after, preventing `*` in environment names from being escaped.
- **Added** leading `=` fix in display math: lines starting with `=` are merged onto the nearest previous non-empty line to prevent setext H1 heading interpretation. Consecutive `=` lines merge recursively. Fallback to leading space when `=` is on the first line. Merged-line cleanup uses newline-only trimming (`/^\n+|\n+$/g`) to preserve intentional leading spaces.
- **Updated** `generateHugoToml` passthrough delimiters: block expanded to `[["$$", "$$"], ['\\[', '\\]']]`, inline expanded to `[["$", "$"], ['\\(', '\\)']]`  for comprehensive math passthrough.
- **Added** empty line removal inside display math: after trim, `mathLines` is filtered to exclude whitespace-only lines before the `=` merge pass. This prevents Goldmark from breaking out of math mode. Also simplified the `=` merge target search (no longer needs to skip empty lines since they're pre-filtered).
- **Updated** GitHub Pages deploy instructions (Step 3) with detailed navigation path: Settings → Code and automation → Pages → Build and deployment → GitHub Actions.
- **Version bump**: v1.3 → v1.4.

## User Instructions Summary

User requested two features for config auto-fill: (1) scan all configurations from an uploaded existing blog repository and auto-fill them in the Configure step, and (2) show a warning when users modify auto-filled values to notify them they're changing existing blog information. User specified section-aware TOML parsing, LaTeX toggle auto-detection, both inline and top-banner warnings, and dismissible behavior.

User then requested two LaTeX formatting bug fixes: (1) display math `$$` delimiters must be on their own lines with blank-line separation — never sharing a line with other content, and (2) inline math `$` delimiters must have spaces both inside (`$ content $`) and outside (separated from all adjacent characters including punctuation). User confirmed: spaces inside delimiters are intentional (Hugo passthrough config handles rendering), and punctuation should be space-separated from delimiters (e.g., `( $ x^2 $ )`, `$ x^2 $ ,`).

User requested two additional LaTeX adjustments: (1) replace `\begin{flalign}`/`\begin{flalign*}` with `align`/`align*` environments, and (2) prevent lines starting with `=` inside display math from being interpreted as setext H1 headings by adding a leading space. User also requested expanding the `hugo.toml` passthrough delimiters to include `\[`/`\]` (block) and `\(`/`\)` (inline) alongside the existing `$$` and `$` pairs, providing parser-level math passthrough in Goldmark.

User then refined the leading `=` fix: instead of adding a leading space, merge the entire `=` line onto the nearest previous non-empty line (e.g., `x^2\n= z^2` → `x^2 = z^2`). Consecutive `=` lines merge recursively into a single line. Fallback to leading space only when `=` is on the very first line with no previous line to merge onto.

User requested removal of empty lines inside display math `$$` blocks, as empty lines cause Goldmark to break out of math mode and render subsequent content as plain text.
