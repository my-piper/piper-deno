import sharp from "sharp";

export async function run(): Promise<{
  payload: { outputs: { image: Uint8Array } };
}> {
  const image = await sharp({
    create: { width: 100, height: 100, channels: 4, background: "black" },
  }).png().toBuffer();
  return { payload: { outputs: { image } } };
}
