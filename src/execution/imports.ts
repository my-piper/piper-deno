// Hosts node scripts may import modules from. Deno's own default list
// (deno.land, jsr, esm.sh, jsDelivr, GitHub raw) is replaced, not extended,
// by --allow-import, so it is repeated here before the configured hosts —
// e.g. Piper's internal Package Registry.
export const DEFAULT_IMPORT_HOSTS = [
  "deno.land",
  "jsr.io",
  "esm.sh",
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
];

export function importHosts(
  extra: string | undefined = Deno.env.get("ALLOW_IMPORT_HOSTS"),
): string[] {
  const added = (extra ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  return [...DEFAULT_IMPORT_HOSTS, ...added];
}
