import { assertEquals, assertStringIncludes } from "@std/assert";

const script = `
  import sharp from "sharp";
  export async function run() {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 4, background: "black" }
    }).png().toBuffer();
    return { image };
  }
`;

Deno.test("server - Sharp returns a PNG in Worker isolation", async () => {
  const response = await fetch("http://127.0.0.1:3333", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, fn: "run", payload: {}, isolation: "none" }),
  });
  const data = await response.json();

  assertEquals(response.status, 200, JSON.stringify(data));
  assertStringIncludes(data.result.image, "data:image/png;base64,");
});

Deno.test("server - Process isolation refuses Sharp", async () => {
  const response = await fetch("http://127.0.0.1:3333", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script,
      fn: "run",
      payload: {},
      isolation: "process",
    }),
  });
  const data = await response.json();

  assertEquals(response.status, 422);
  assertStringIncludes(data.message, "env access");
});
