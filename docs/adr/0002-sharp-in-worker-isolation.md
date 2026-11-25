# Sharp in Worker isolation

Piper is an internal tool whose Pipeline editors are trusted to supply code
(Piper ADR 0007). Replace ImageScript with Sharp for image processing in Worker
isolation (`isolation: "none"`). This revisits the shared-worker native-code
prohibition in Piper ADR 0006: trusted scripts may load native code in the
service process, accepting its OS access, shared memory, and process crash risk.

Workers get FFI and system permissions, and direct environment access only to
`npm_package_config_libvips` and `MALLOC_ARENA_MAX`, which Sharp reads at startup.
These Deno permissions do not sandbox native code. Process isolation retains
its existing restrictions and does not support Sharp; callers using Sharp must
explicitly select Worker isolation. The service's default remains Process
isolation.

Install Sharp and its optional native binaries into local `node_modules` at
build time for the target OS and architecture. Keep the dependency version
pinned and locked. Sharp's Buffer results use the existing binary-to-data-URI
conversion; no new image API or result representation is needed.
