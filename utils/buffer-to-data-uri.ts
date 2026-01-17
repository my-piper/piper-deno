import { encodeBase64 } from "jsr:@std/encoding/base64";

/**
 * Detects MIME type from buffer content by checking magic numbers (file signatures)
 */
function detectMimeType(buffer: Uint8Array): string {
  if (buffer.length === 0) {
    return "application/octet-stream";
  }

  // Check for common file signatures (magic numbers)
  const signature = Array.from(buffer.slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Image formats
  if (signature.startsWith("ffd8ff")) return "image/jpeg";
  if (signature.startsWith("89504e47")) return "image/png";
  if (signature.startsWith("47494638")) return "image/gif";
  if (signature.startsWith("52494646") && signature.includes("57454250")) {
    return "image/webp";
  }
  if (signature.startsWith("424d")) return "image/bmp";
  if (signature.startsWith("49492a00") || signature.startsWith("4d4d002a")) {
    return "image/tiff";
  }
  if (signature.startsWith("3c737667") || signature.startsWith("3c3f786d")) {
    return "image/svg+xml";
  }
  if (signature.startsWith("00000")) {
    // Could be AVIF or other formats
    const avifCheck = signature.substring(8, 16);
    if (avifCheck === "66747970") return "image/avif";
  }

  // Video formats
  if (
    signature.startsWith("000000") &&
    (signature.includes("66747970") || signature.includes("6d646174"))
  ) {
    return "video/mp4";
  }
  if (signature.startsWith("1a45dfa3")) return "video/webm";
  if (signature.startsWith("464c56")) return "video/x-flv";

  // Audio formats
  if (signature.startsWith("494433") || signature.startsWith("fffb")) {
    return "audio/mpeg";
  }
  if (signature.startsWith("4f676753")) return "audio/ogg";
  if (signature.startsWith("52494646") && signature.includes("57415645")) {
    return "audio/wav";
  }

  // Document formats
  if (signature.startsWith("25504446")) return "application/pdf";
  if (
    signature.startsWith("504b0304") ||
    signature.startsWith("504b0506") ||
    signature.startsWith("504b0708")
  ) {
    // ZIP-based formats (DOCX, XLSX, etc.)
    return "application/zip";
  }
  if (signature.startsWith("d0cf11e0")) {
    return "application/vnd.ms-office"; // Old Office formats
  }

  // Archive formats
  if (signature.startsWith("1f8b")) return "application/gzip";
  if (signature.startsWith("425a68")) return "application/x-bzip2";
  if (signature.startsWith("377abcaf271c")) {
    return "application/x-7z-compressed";
  }
  if (signature.startsWith("526172211a07")) {
    return "application/x-rar-compressed";
  }

  // Text formats - check if it's valid UTF-8 text
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.slice(0, Math.min(512, buffer.length)),
    );
    // Check if it looks like text (printable characters)
    if (/^[\x20-\x7E\s]*$/.test(text)) {
      const trimmed = text.trim();
      const lowerText = trimmed.toLowerCase();

      // Check for specific text formats
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return "application/json";
      }
      if (lowerText.includes("<!doctype html") || lowerText.includes("<html")) {
        return "text/html";
      }
      // Check for SVG (with or without XML declaration)
      if (lowerText.includes("<svg")) {
        return "image/svg+xml";
      }
      if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
        return "application/xml";
      }
      return "text/plain";
    }
  } catch {
    // Not valid UTF-8, continue with binary detection
  }

  // Default to binary
  return "application/octet-stream";
}

/**
 * Converts a Buffer to a data URI with base64 encoding
 */
function bufferToDataUri(buffer: Uint8Array): string {
  // Convert Uint8Array to base64 using Deno's standard library (fastest method)
  // This is much faster than btoa(String.fromCharCode(...buffer)) for large buffers
  const base64 = encodeBase64(buffer);

  // Detect MIME type from buffer content
  const mimeType = detectMimeType(buffer);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Recursively converts all Uint8Array (Buffer) objects in a value to data URIs
 *
 * This function is called:
 * 1. In worker-process.ts BEFORE JSON serialization (handles real Uint8Arrays)
 * 2. In server.ts for isolation="none" mode (handles real Uint8Arrays)
 *
 * Since we convert before serialization, we never encounter serialized arrays
 * like {"0": 137, "1": 80, ...} - they're already data URI strings!
 */
export function convertBuffersToDataUris(value: unknown): unknown {
  // Handle null and undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Uint8Array (Buffer in Deno)
  if (value instanceof Uint8Array) {
    return bufferToDataUri(value);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => convertBuffersToDataUris(item));
  }

  // Handle plain objects - recursively convert values
  if (typeof value === "object" && value.constructor === Object) {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = convertBuffersToDataUris(val);
    }
    return result;
  }

  // Return primitives and other types as-is
  return value;
}
