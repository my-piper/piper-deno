import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

export async function run() {
  const img = new Image(100, 100);
  img.fill(0x000000ff);
  const image = await img.encode();
  return { payload: { outputs: { image } } };
}

