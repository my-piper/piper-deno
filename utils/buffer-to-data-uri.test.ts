import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { convertBuffersToDataUris } from "./buffer-to-data-uri.ts";

Deno.test("convertBuffersToDataUris - handles null and undefined", () => {
  assertEquals(convertBuffersToDataUris(null), null);
  assertEquals(convertBuffersToDataUris(undefined), undefined);
});

Deno.test("convertBuffersToDataUris - handles primitives", () => {
  assertEquals(convertBuffersToDataUris(42), 42);
  assertEquals(convertBuffersToDataUris("hello"), "hello");
  assertEquals(convertBuffersToDataUris(true), true);
});

Deno.test("convertBuffersToDataUris - converts Uint8Array to data URI", () => {
  const buffer = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" in ASCII
  const result = convertBuffersToDataUris(buffer);
  assertEquals(typeof result, "string");
  assertEquals(
    result,
    "data:text/plain;base64,SGVsbG8=",
  );
});

Deno.test("convertBuffersToDataUris - detects PNG image", () => {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngBuffer = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ]);
  const result = convertBuffersToDataUris(pngBuffer);
  assertEquals(typeof result, "string");
  assertEquals(result?.toString().startsWith("data:image/png;base64,"), true);
});

Deno.test("convertBuffersToDataUris - detects JPEG image", () => {
  // JPEG signature: FF D8 FF
  const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const result = convertBuffersToDataUris(jpegBuffer);
  assertEquals(typeof result, "string");
  assertEquals(result?.toString().startsWith("data:image/jpeg;base64,"), true);
});

Deno.test("convertBuffersToDataUris - detects GIF image", () => {
  // GIF signature: 47 49 46 38 39 61 (GIF89a)
  const gifBuffer = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const result = convertBuffersToDataUris(gifBuffer);
  assertEquals(typeof result, "string");
  assertEquals(result?.toString().startsWith("data:image/gif;base64,"), true);
});

Deno.test("convertBuffersToDataUris - detects PDF", () => {
  // PDF signature: 25 50 44 46 (%PDF)
  const pdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
  const result = convertBuffersToDataUris(pdfBuffer);
  assertEquals(typeof result, "string");
  assertEquals(
    result?.toString().startsWith("data:application/pdf;base64,"),
    true,
  );
});

Deno.test("convertBuffersToDataUris - detects JSON text", () => {
  const jsonBuffer = new TextEncoder().encode('{"key": "value"}');
  const result = convertBuffersToDataUris(jsonBuffer);
  assertEquals(typeof result, "string");
  assertEquals(
    result?.toString().startsWith("data:application/json;base64,"),
    true,
  );
});

Deno.test("convertBuffersToDataUris - detects plain text", () => {
  const textBuffer = new TextEncoder().encode("Hello, World!");
  const result = convertBuffersToDataUris(textBuffer);
  assertEquals(typeof result, "string");
  assertEquals(result?.toString().startsWith("data:text/plain;base64,"), true);
});

Deno.test("convertBuffersToDataUris - detects HTML", () => {
  const htmlBuffer = new TextEncoder().encode("<!DOCTYPE html><html></html>");
  const result = convertBuffersToDataUris(htmlBuffer);
  assertEquals(typeof result, "string");
  assertEquals(result?.toString().startsWith("data:text/html;base64,"), true);
});

Deno.test("convertBuffersToDataUris - detects SVG", () => {
  const svgBuffer = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
  );
  const result = convertBuffersToDataUris(svgBuffer) as string;

  assertEquals(typeof result, "string");
  assertEquals(result.startsWith("data:image/svg+xml;base64,"), true);
});

Deno.test("convertBuffersToDataUris - detects SVG with XML declaration", () => {
  const svgBuffer = new TextEncoder().encode(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
  );
  const result = convertBuffersToDataUris(svgBuffer) as string;

  assertEquals(typeof result, "string");
  assertEquals(result.startsWith("data:image/svg+xml;base64,"), true);
});

Deno.test("convertBuffersToDataUris - handles arrays with buffers", () => {
  const buffer1 = new Uint8Array([72, 101]); // "He"
  const buffer2 = new Uint8Array([108, 108, 111]); // "llo"
  const input = [buffer1, "text", 42, buffer2];

  const result = convertBuffersToDataUris(input) as unknown[];

  assertEquals(Array.isArray(result), true);
  assertEquals(result.length, 4);
  assertEquals(result[0], "data:text/plain;base64,SGU=");
  assertEquals(result[1], "text");
  assertEquals(result[2], 42);
  assertEquals(result[3], "data:text/plain;base64,bGxv");
});

Deno.test("convertBuffersToDataUris - handles objects with buffers", () => {
  const buffer = new Uint8Array([72, 105]); // "Hi"
  const input = {
    name: "test",
    data: buffer,
    count: 5,
  };

  const result = convertBuffersToDataUris(input) as Record<string, unknown>;

  assertEquals(typeof result, "object");
  assertEquals(result.name, "test");
  assertEquals(result.data, "data:text/plain;base64,SGk=");
  assertEquals(result.count, 5);
});

Deno.test("convertBuffersToDataUris - handles nested structures", () => {
  const buffer1 = new Uint8Array([65]); // "A"
  const buffer2 = new Uint8Array([66]); // "B"

  const input = {
    items: [
      { id: 1, buffer: buffer1 },
      { id: 2, buffer: buffer2 },
    ],
    metadata: {
      thumbnail: buffer1,
      name: "test",
    },
  };

  const result = convertBuffersToDataUris(input) as Record<string, unknown>;

  assertEquals(typeof result, "object");
  const items = result.items as Array<Record<string, unknown>>;
  assertEquals(items[0].id, 1);
  assertEquals(items[0].buffer, "data:text/plain;base64,QQ==");
  assertEquals(items[1].id, 2);
  assertEquals(items[1].buffer, "data:text/plain;base64,Qg==");

  const metadata = result.metadata as Record<string, unknown>;
  assertEquals(metadata.thumbnail, "data:text/plain;base64,QQ==");
  assertEquals(metadata.name, "test");
});

Deno.test("convertBuffersToDataUris - handles empty buffer", () => {
  const buffer = new Uint8Array([]);
  const result = convertBuffersToDataUris(buffer);
  assertEquals(result, "data:application/octet-stream;base64,");
});

Deno.test("convertBuffersToDataUris - preserves non-plain objects", () => {
  class CustomClass {
    value = 42;
  }
  const instance = new CustomClass();
  const result = convertBuffersToDataUris(instance);
  assertEquals(result, instance); // Should return as-is
});
