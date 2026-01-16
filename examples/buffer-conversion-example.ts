/**
 * Example demonstrating Buffer to Data URI conversion with MIME type detection
 *
 * This example shows how the server automatically converts Uint8Array (Buffer)
 * objects in the result to data URIs with base64 encoding and proper MIME types.
 *
 * The server detects MIME types based on:
 * - Magic numbers (file signatures) for binary formats (PNG, JPEG, PDF, etc.)
 * - Content analysis for text formats (JSON, HTML, XML, plain text)
 *
 * To test this:
 * 1. Start the server: deno task dev
 * 2. Run this example: deno run --allow-net examples/buffer-conversion-example.ts
 */

const BASE_URL = "http://127.0.0.1:3333";

async function testBufferConversion(): Promise<void> {
  console.log(
    "Testing Buffer to Data URI conversion with MIME type detection...\n",
  );

  // Example 1: Text buffer (auto-detected as text/plain)
  console.log("Example 1: Plain text Uint8Array");
  const response1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: `
        export function run(inputs) {
          // Return a Uint8Array representing "Hello"
          return new Uint8Array([72, 101, 108, 108, 111]);
        }
      `,
      fn: "run",
      payload: {},
    }),
  });

  const data1 = await response1.json();
  console.log("Result:", data1.result);
  console.log("MIME type detected: text/plain\n");

  // Example 2: PNG image (auto-detected as image/png)
  console.log("Example 2: PNG image buffer");
  const response2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: `
        export function run(inputs) {
          return {
            name: "image.png",
            data: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG signature
            size: 8
          };
        }
      `,
      fn: "run",
      payload: {},
    }),
  });

  const data2 = await response2.json();
  console.log("Result:", JSON.stringify(data2.result, null, 2));
  console.log("MIME type detected: image/png\n");

  // Example 3: Nested buffers
  console.log("Example 3: Nested structure with multiple Uint8Arrays");
  const response3 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: `
        export function run(inputs) {
          return {
            images: [
              { id: 1, thumbnail: new Uint8Array([65, 66]) },
              { id: 2, thumbnail: new Uint8Array([67, 68]) }
            ],
            metadata: {
              preview: new Uint8Array([69, 70]),
              title: "Gallery"
            }
          };
        }
      `,
      fn: "run",
      payload: {},
    }),
  });

  const data3 = await response3.json();
  console.log("Result:", JSON.stringify(data3.result, null, 2));
  console.log();

  // Example 4: Mixed types
  console.log("Example 4: Mixed types (preserves non-buffer values)");
  const response4 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: `
        export function run(inputs) {
          return {
            text: "hello",
            number: 42,
            bool: true,
            null: null,
            array: [1, 2, 3],
            buffer: new Uint8Array([65])
          };
        }
      `,
      fn: "run",
      payload: {},
    }),
  });

  const data4 = await response4.json();
  console.log("Result:", JSON.stringify(data4.result, null, 2));
  console.log();

  // Example 5: JSON buffer (auto-detected as application/json)
  console.log("Example 5: JSON buffer");
  const response5 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: `
        export function run(inputs) {
          const jsonText = JSON.stringify({ message: "Hello, World!" });
          return new TextEncoder().encode(jsonText);
        }
      `,
      fn: "run",
      payload: {},
    }),
  });

  const data5 = await response5.json();
  console.log("Result:", data5.result);
  console.log("MIME type detected: application/json\n");

  // Example 6: JPEG image (auto-detected as image/jpeg)
  console.log("Example 6: JPEG image buffer");
  const response6 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: `
        export function run(inputs) {
          // JPEG signature
          return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
        }
      `,
      fn: "run",
      payload: {},
    }),
  });

  const data6 = await response6.json();
  console.log("Result:", data6.result);
  console.log("MIME type detected: image/jpeg\n");

  // Example 7: SVG image (auto-detected as image/svg+xml)
  console.log("Example 7: SVG image buffer");
  const response7 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: `
        export function run(inputs) {
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>';
          return new TextEncoder().encode(svg);
        }
      `,
      fn: "run",
      payload: {},
    }),
  });

  const data7 = await response7.json();
  console.log("Result:", data7.result.substring(0, 80) + "...");
  console.log("MIME type detected: image/svg+xml\n");

  console.log("✅ All examples completed!");
  console.log("\nSupported MIME types:");
  console.log("- Images: PNG, JPEG, GIF, WebP, BMP, TIFF, SVG, AVIF");
  console.log("- Videos: MP4, WebM, FLV");
  console.log("- Audio: MP3, OGG, WAV");
  console.log("- Documents: PDF, ZIP, Office formats");
  console.log("- Text: JSON, XML, HTML, plain text");
  console.log("- Archives: GZIP, BZIP2, 7Z, RAR");
}

// Run the examples
testBufferConversion().catch(console.error);
