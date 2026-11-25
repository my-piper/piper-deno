import { assertEquals, assertStringIncludes } from "@std/assert";
import { decodeBase64 } from "@std/encoding/base64";
import sharp from "sharp";
import { execute } from "./executor.ts";

const script = `
  import sharp from "sharp";
  export async function run({ width }) {
    const image = await sharp({
      create: { width, height: 10, channels: 4, background: "black" }
    }).png().toBuffer();
    return { payload: { outputs: { image } } };
  }
`;

type ImageResult = { payload: { outputs: { image: string } } };

async function assertImage(result: unknown, width: number): Promise<void> {
  const uri = (result as ImageResult).payload.outputs.image;
  assertStringIncludes(uri, "data:image/png;base64,");
  const metadata = await sharp(decodeBase64(uri.split(",")[1])).metadata();
  assertEquals(metadata.width, width);
  assertEquals(metadata.height, 10);
}

Deno.test("Worker isolation - Sharp loads from an HTTP script URL", async () => {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    () =>
      new Response(script, {
        headers: { "content-type": "application/javascript" },
      }),
  );
  const host = `localhost:${server.addr.port}`;
  const previousHosts = Deno.env.get("ALLOW_IMPORT_HOSTS");
  Deno.env.set("ALLOW_IMPORT_HOSTS", host);

  try {
    const result = await execute({
      script: `http://${host}/image.js`,
      fn: "run",
      payload: { width: 55 },
    });

    await assertImage(result.result, 55);
  } finally {
    if (previousHosts === undefined) Deno.env.delete("ALLOW_IMPORT_HOSTS");
    else Deno.env.set("ALLOW_IMPORT_HOSTS", previousHosts);
    await server.shutdown();
  }
});

Deno.test("Worker isolation - Sharp images survive concurrency and worker reuse", async () => {
  const widths = [11, 22, 33];

  const results = await Promise.all(
    widths.map((width) => execute({ script, fn: "run", payload: { width } })),
  );

  await Promise.all(
    results.map((result, i) => assertImage(result.result, widths[i])),
  );
  const reused = await execute({ script, fn: "run", payload: { width: 44 } });
  await assertImage(reused.result, 44);
});

Deno.test("Worker isolation - Sharp loads from a script URL", async () => {
  const path = await Deno.makeTempFile({ suffix: ".js" });
  await Deno.writeTextFile(path, script);

  try {
    const result = await execute({
      script: new URL(`file://${path}`).href,
      fn: "run",
      payload: { width: 55 },
    });

    await assertImage(result.result, 55);
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("Worker isolation - Sharp works after worker recycling", async () => {
  for (let i = 0; i < 105; i++) {
    // Cross the pool's recycling threshold through the public executor.
    // deno-lint-ignore no-await-in-loop
    const result = await execute({ script, fn: "run", payload: { width: 66 } });

    // deno-lint-ignore no-await-in-loop
    await assertImage(result.result, 66);
  }
});
