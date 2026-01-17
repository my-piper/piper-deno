import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { convertBuffersToDataUris } from "./utils/buffer-to-data-uri.ts";

Deno.test("run() function from example returns data URI", async () => {
  const { run } = await import("./examples/image-test.ts");
  const rawResult = await run();

  assertEquals(rawResult.payload.outputs.image instanceof Uint8Array, true);

  const convertedResult = convertBuffersToDataUris(rawResult);
  const image = (convertedResult as any).payload.outputs.image;

  assertEquals(typeof image, "string");
  assertStringIncludes(image, "data:image/png;base64,");

  console.log("✅ Example returns buffer that converts to data URI");
  console.log(`📊 Buffer size: ${rawResult.payload.outputs.image.length} bytes`);
  console.log(`📊 Data URI length: ${image.length} characters`);
});
