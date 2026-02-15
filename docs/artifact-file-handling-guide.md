# File Upload & Download in Claude Artifacts

A practical guide to handling file uploads and downloads within Claude's sandboxed React Artifact environment.

---

## 1. File Upload

File upload works normally in Artifacts using the standard `FileReader` API. There are no sandbox restrictions on reading files from the user's device.

### Implementation

Use a hidden `<input type="file">` paired with a styled `<label>` for better UI. Read the file content with `FileReader.readAsText()` for text files, or `readAsArrayBuffer()` / `readAsDataURL()` for binary files.

### Example Code

```jsx
import { useState, useRef } from "react";

export default function FileUploader() {
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const inputRef = useRef(null);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      setContent(event.target.result);
    };
    reader.readAsText(file); // Use readAsArrayBuffer() for binary files
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.csv,.json,.md"
        onChange={handleUpload}
        className="hidden"
        id="file-input"
      />
      <label htmlFor="file-input" style={{ cursor: "pointer" }}>
        {fileName || "Click to select a file"}
      </label>

      {content && <pre>{content.slice(0, 500)}</pre>}
    </div>
  );
}
```

### Key Notes

- `FileReader` is fully supported in the sandbox with no restrictions.
- Use the `accept` attribute to filter file types.
- For large files, consider reading in chunks or only displaying a preview.

---

## 2. File Download

File download in Claude Artifacts is restricted by the sandbox's Content Security Policy (CSP) and its internal link interception mechanism. The **only working method** is a base64-encoded Data URI rendered as a declarative `<a>` tag.

### Implementation

1. Convert the text content to bytes using `TextEncoder`.
2. Build a binary string from the byte array.
3. Encode the binary string to base64 using `btoa()`.
4. Construct a Data URI with the format `data:<MIME>;base64,<encoded_data>`.
5. Render it as a standard `<a>` tag with a `download` attribute.

When the user clicks the link, the Artifact sandbox intercepts the click, decodes the base64 payload via `atob()`, and triggers the Claude UI's native download prompt.

### Example Code

```jsx
function textToBase64(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function DownloadButton({ content, filename }) {
  const href = "data:text/plain;base64," + textToBase64(content);

  return (
    <a href={href} download={filename}>
      Download File
    </a>
  );
}
```

### Why `TextEncoder` + `btoa()` Instead of Plain `btoa()`

Plain `btoa(text)` fails on any string containing characters outside the Latin-1 range (code points > 255), which includes all non-ASCII text such as Chinese, emoji, or accented characters. The `TextEncoder` approach first converts the string to UTF-8 bytes, then builds a Latin-1 binary string from those bytes, ensuring `btoa()` always succeeds regardless of content.

### Key Notes

- The `<a>` tag must be **declaratively rendered** in JSX, not programmatically created and clicked.
- The `download` attribute controls the suggested filename.
- This approach supports UTF-8 text content of any language.
- For non-text files, adjust the MIME type accordingly (e.g., `data:application/json;base64,...`).

---

## 3. Methods That Get Blocked

### Method A: `Blob` + `URL.createObjectURL()` — Blocked by CSP

```jsx
// ❌ DOES NOT WORK — CSP blocks blob: URLs

const blob = new Blob([content], { type: "text/plain" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;       // blob:https://... is blocked
a.download = "file.txt";
a.click();           // Also blocked: programmatic click in sandbox
URL.revokeObjectURL(url);
```

**Error:** `Refused to frame 'blob:...' because it violates the Content Security Policy directive: "frame-src ..."`

**Why it fails:** The Artifact sandbox's CSP does not include `blob:` in its `frame-src` directive. Any attempt to navigate to or frame a blob URL is rejected by the browser.

### Method B: `encodeURIComponent()` Data URI — Blocked by Sandbox Interceptor

```jsx
// ❌ DOES NOT WORK — atob() cannot decode URL-encoded strings

const href = "data:text/plain;charset=utf-8," + encodeURIComponent(content);

<a href={href} download="file.txt">Download</a>
```

**Error:** `Uncaught InvalidCharacterError: Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded.`

**Why it fails:** When the user clicks a download link, the Artifact sandbox intercepts the event and attempts to decode the Data URI's payload using `atob()`. The `atob()` function expects a base64-encoded string, but `encodeURIComponent()` produces percent-encoded text (e.g., `%20`, `%2B`), which is not valid base64. This mismatch causes the decoding to fail.

### Summary Table

| Method | Encoding | Trigger | Result |
|---|---|---|---|
| `blob:` URL + programmatic click | N/A | `a.click()` | CSP blocks `blob:` URLs |
| `data:` URI + `encodeURIComponent` | URL encoding | `<a>` tag click | `atob()` fails on non-base64 input |
| **`data:` URI + base64** | **base64** | **`<a>` tag click** | **Works** |

---

## 4. Complete Working Example

Below is a minimal but complete component that combines upload, text processing, and download:

```jsx
import { useState, useRef } from "react";

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function TextModifier() {
  const [file, setFile] = useState(null);
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  const handleUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setOriginal(ev.target.result);
      setModified("");
      setDone(false);
    };
    reader.readAsText(f);
  };

  const handleModify = () => {
    setModified(original.replaceAll("+", "-"));
    setDone(true);
  };

  const downloadName = file
    ? file.name.replace(/(\.[^.]+)$/, "_modified$1")
    : "modified.txt";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".txt"
        onChange={handleUpload}
        className="hidden"
        id="upload"
      />
      <label htmlFor="upload">{file ? file.name : "Select file"}</label>

      {file && !done && (
        <button onClick={handleModify}>Replace + with -</button>
      )}

      {done && (
        <a
          href={"data:text/plain;base64," + textToBase64(modified)}
          download={downloadName}
        >
          Download Modified File
        </a>
      )}
    </div>
  );
}
```
