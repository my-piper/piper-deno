// The only variables a script's process inherits: what Deno needs to find
// itself and its module cache, and how it reaches the network (proxy,
// certificates) and formats dates. The server's environment holds secrets
// such as DENO_AUTH_TOKENS. Only unsigned code (Script Nodes) runs in a
// process, and it can't load registry scripts, so it doesn't get the token.
// Scripts get no env access either: Piper sends a node's Variables in the
// payload. /proc is denied too, as /proc/self/environ is the same environment
// as a file.
const INHERITED = [
  "PATH",
  "HOME",
  "DENO_DIR",
  "XDG_CACHE_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "DENO_CERT",
  "DENO_TLS_CA_STORE",
  "SSL_CERT_FILE",
  "TZ",
  "LANG",
];

export type ChildCommandOptions = {
  parentEnv: Record<string, string>;
  importHosts: string[];
  memoryMb: number;
  child: string;
};

export function childCommand(
  { parentEnv, importHosts, memoryMb, child }: ChildCommandOptions,
): { args: string[]; clearEnv: true; env: Record<string, string> } {
  const env: Record<string, string> = {};
  for (const name of INHERITED) {
    if (parentEnv[name] !== undefined) {
      env[name] = parentEnv[name];
    }
  }

  return {
    args: [
      "run",
      "--allow-net",
      "--allow-read",
      "--deny-read=/proc",
      `--allow-import=${importHosts.join(",")}`,
      // Node scripts are not service dependencies: keep them out of deno.lock
      "--no-lock",
      // Set V8 memory limit for THIS process only
      `--v8-flags=--max-old-space-size=${memoryMb}`,
      child,
    ],
    clearEnv: true,
    env,
  };
}
