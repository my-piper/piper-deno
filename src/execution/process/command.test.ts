import { assert, assertEquals } from "@std/assert";
import { childCommand } from "./command.ts";

function command(parentEnv: Record<string, string> = {}) {
  return childCommand({
    parentEnv,
    importHosts: ["deno.land", "registry:8085"],
    memoryMb: 128,
    child: "file:///app/src/execution/process/child.ts",
  });
}

Deno.test("child command - passes on only what Deno needs, never the server's secrets", () => {
  const parentEnv = {
    PATH: "/usr/local/bin:/usr/bin",
    HOME: "/root",
    DENO_DIR: "/deno-dir",
    DENO_AUTH_TOKENS: "local-registry-token@registry:8085",
    PER_WORKER_MEMORY_MB: "128",
    ALLOW_IMPORT_HOSTS: "registry:8085",
    SOME_SERVICE_SECRET: "s3cr3t",
  };

  const { clearEnv, env } = command(parentEnv);

  assertEquals(clearEnv, true);
  assertEquals(env, {
    PATH: "/usr/local/bin:/usr/bin",
    HOME: "/root",
    DENO_DIR: "/deno-dir",
  });
});

Deno.test("child command - keeps the proxy, certificate and locale settings", () => {
  const parentEnv = {
    HTTPS_PROXY: "http://proxy:3128",
    http_proxy: "http://proxy:3128",
    NO_PROXY: "registry",
    DENO_CERT: "/certs/ca.pem",
    DENO_TLS_CA_STORE: "system",
    SSL_CERT_FILE: "/etc/ssl/ca.pem",
    TZ: "Europe/Berlin",
    LANG: "en_US.UTF-8",
  };

  const { env } = command(parentEnv);

  assertEquals(env, parentEnv);
});

Deno.test("child command - denies /proc and grants no env, ffi or run access", () => {
  const { args } = command();

  assert(args.includes("--deny-read=/proc"));
  for (
    const flag of [
      "--allow-env",
      "--allow-ffi",
      "--allow-run",
      "--allow-all",
      "-A",
    ]
  ) {
    assert(
      !args.some((arg) => arg === flag || arg.startsWith(`${flag}=`)),
      flag,
    );
  }
});

Deno.test("child command - runs the child with the memory limit and import hosts", () => {
  const { args } = command();

  assertEquals(args, [
    "run",
    "--allow-net",
    "--allow-read",
    "--deny-read=/proc",
    "--allow-import=deno.land,registry:8085",
    "--no-lock",
    "--v8-flags=--max-old-space-size=128",
    "file:///app/src/execution/process/child.ts",
  ]);
});
