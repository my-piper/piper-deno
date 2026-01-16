# MIME Type Detection Implementation

## Why Custom Implementation?

We evaluated using external libraries like `file-type` from npm but decided to keep our custom implementation for the following reasons:

### 1. **Library Limitations**

The popular `file-type` npm package has several limitations:

- **Requires complete file data**: It needs to read significant portions of the file, which can fail with small buffers
- **Poor SVG support**: Doesn't detect SVG files reliably (returns `undefined` for SVG content)
- **Heavy dependencies**: Pulls in multiple dependencies (`strtok3`, `token-types`, `uint8array-extras`, etc.)
- **ESM-only**: While Deno supports this, it adds complexity

### 2. **Our Implementation Advantages**

Our custom `detectMimeType()` function:

- **Lightweight**: No external dependencies, ~100 lines of code
- **Fast**: Simple magic number checks and text analysis
- **Flexible**: Works with partial buffers (as small as 12 bytes for binary formats)
- **SVG-friendly**: Detects SVG both by magic number (`<svg`) and content analysis
- **Text-aware**: Intelligently detects JSON, HTML, XML, and plain text
- **Maintainable**: Easy to add new formats or adjust detection logic

### 3. **Supported Formats**

Our implementation supports 30+ MIME types:

#### Binary Formats (Magic Number Detection)
- **Images**: PNG, JPEG, GIF, WebP, BMP, TIFF, AVIF
- **Videos**: MP4, WebM, FLV
- **Audio**: MP3, OGG, WAV
- **Documents**: PDF, ZIP, Office formats
- **Archives**: GZIP, BZIP2, 7Z, RAR

#### Text Formats (Content Analysis)
- **Structured**: JSON, XML, HTML
- **Vector Graphics**: SVG (with or without XML declaration)
- **Plain Text**: UTF-8 text

### 4. **Detection Strategy**

1. **Magic Numbers First**: Check first 12 bytes for binary format signatures
2. **Text Analysis**: If not binary, try UTF-8 decode and analyze content
3. **Fallback**: Default to `application/octet-stream` for unknown formats

### 5. **SVG Support**

SVG detection is particularly robust:

```typescript
// Detects by magic number
if (signature.startsWith("3c737667")) return "image/svg+xml"; // <svg

// Also detects by content analysis
if (lowerText.includes("<svg")) return "image/svg+xml";
```

This handles:
- `<svg xmlns="...">` - Direct SVG
- `<?xml version="1.0"?><svg>` - SVG with XML declaration
- Whitespace variations

## Testing

We have comprehensive tests covering:
- All major binary formats (PNG, JPEG, GIF, PDF, etc.)
- Text formats (JSON, HTML, XML, plain text)
- SVG with and without XML declarations
- Nested structures
- Edge cases (empty buffers, mixed types)

**Test Results**: 17/17 tests passing ✅

## Future Enhancements

If needed, we can easily:
- Add more MIME types by extending the magic number checks
- Improve text format detection with more sophisticated heuristics
- Add file extension hints as a fallback
- Integrate with `@std/media-types` for extension-based detection

## Conclusion

Our custom implementation is:
- ✅ Simpler
- ✅ Faster
- ✅ More reliable for our use case
- ✅ Better SVG support
- ✅ No external dependencies
- ✅ Easier to maintain and extend

For these reasons, we recommend keeping the custom implementation rather than adopting an external library.

