# 0001. Custom MIME detection instead of `file-type`

- Status: accepted

## Context

Scripts may return binary data (`Uint8Array`), which the service converts into
`data:` URIs before responding. To build the URI we need the MIME type from the
bytes alone, with no filename or extension.

The obvious choice was the `file-type` npm package. For our inputs it fell
short:

- It needs a large part of the file and is unreliable on small buffers.
- It does not detect SVG (it returns `undefined` for SVG content), and SVG is a
  common script output.
- It pulls in several transitive dependencies (`strtok3`, `token-types`,
  `uint8array-extras`, …) into code that runs inside every isolated child.

## Decision

Keep the hand-written `detectMimeType()` in
`src/execution/buffer-to-data-uri.ts`:

1. Check magic numbers in the first 12 bytes for binary formats (images,
   video, audio, PDF, archives, Office formats).
2. Otherwise, decode as UTF-8 and sniff the content (JSON, HTML, XML, SVG with
   or without an XML declaration, plain text).
3. Fall back to `application/octet-stream`.

## Consequences

- No dependencies, about 100 lines, works on buffers as small as 12 bytes, and
  detects SVG reliably.
- We own the format list. A new format means a new signature in that file plus
  a test in `buffer-to-data-uri.test.ts`.
- If detection based on extension hints is ever needed, `@std/media-types` is
  the natural complement, not a replacement.
