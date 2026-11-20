import { assertEquals, assertRejects } from "@std/assert";
import { importHosts } from "./imports.ts";
import { execute as executeInWorker } from "./worker/executor.ts";
import { execute as executeInProcess } from "./process/executor.ts";

const DEFAULT_HOSTS = [
  "deno.land",
  "jsr.io",
  "esm.sh",
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
];

Deno.test("import hosts - Deno's default hosts when nothing is added", () => {
  const hosts = importHosts(undefined);

  assertEquals(hosts, DEFAULT_HOSTS);
});

Deno.test("import hosts - adds the configured hosts to the defaults", () => {
  const hosts = importHosts(" registry:8090 , localhost:8085,");

  assertEquals(hosts, [...DEFAULT_HOSTS, "registry:8090", "localhost:8085"]);
});

// Serves a module that imports a sibling, like a Package Registry does.
function serveModules(): {
  url: string;
  host: string;
  close: () => Promise<void>;
} {
  const files: Record<string, string> = {
    "/pkg/1/node.js": "export const answer = 42;",
    "/pkg/1/n/script.js":
      'import { answer } from "../node.js"; export function run() { return answer; }',
  };
  const server = Deno.serve({ port: 0, onListen: () => {} }, (req) => {
    const body = files[new URL(req.url).pathname];
    return body
      ? new Response(body, {
        headers: { "content-type": "application/javascript" },
      })
      : new Response("not found", { status: 404 });
  });
  const host = `localhost:${server.addr.port}`;
  return {
    url: `http://${host}/pkg/1/n/script.js`,
    host,
    close: () => server.shutdown(),
  };
}

for (
  const [isolation, execute] of [
    ["worker", executeInWorker],
    ["process", executeInProcess],
  ] as const
) {
  Deno.test(`${isolation} isolation - loads a script from an added import host`, async () => {
    const modules = serveModules();
    Deno.env.set("ALLOW_IMPORT_HOSTS", modules.host);

    try {
      const result = await execute({
        script: modules.url,
        fn: "run",
        payload: {},
      });

      assertEquals(result.result, 42);
    } finally {
      Deno.env.delete("ALLOW_IMPORT_HOSTS");
      await modules.close();
    }
  });

  Deno.test(`${isolation} isolation - refuses a script from a host that isn't added`, async () => {
    const modules = serveModules();

    try {
      await assertRejects(
        () => execute({ script: modules.url, fn: "run", payload: {} }),
        Error,
        "import access",
      );
    } finally {
      await modules.close();
    }
  });
}
