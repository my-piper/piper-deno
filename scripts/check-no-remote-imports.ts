// Fails when the service's own code imports a module by http(s) URL.
// Dependencies come from jsr:/npm: via the import map in deno.json.
// Scripts sent by callers may still be URLs; this only checks our sources.

const ROOTS = ["src", "tests", "scripts"];
// Mirrors the "fmt"/"lint" include lists in deno.json.
const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;
const REMOTE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)["']https?:\/\//;

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) yield* walk(path);
    else if (SOURCE_FILE.test(entry.name)) yield path;
  }
}

const offenders: string[] = [];
for (const root of ROOTS) {
  for await (const path of walk(root)) {
    const lines = (await Deno.readTextFile(path)).split("\n");
    lines.forEach((line, i) => {
      if (REMOTE_IMPORT.test(line)) offenders.push(`${path}:${i + 1}: ${line}`);
    });
  }
}

if (offenders.length > 0) {
  console.error("Remote http(s) imports found; use the deno.json import map:");
  for (const offender of offenders) console.error(`  ${offender}`);
  Deno.exit(1);
}
