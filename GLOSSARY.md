# Glossary

**Run request**: A request to execute one script: the script source, the
entry function to call, the payload to pass it, and optionally a timeout and an
isolation mode.

**Script**: A JavaScript/TypeScript module supplied by the caller,
either as source text or as a URL. It must export the entry function. Scripts
using Worker isolation must be trusted to run with the service’s access.

**Entry function** (`fn`): The exported function of the script that is invoked
with the payload. Its return value becomes the result.

**Payload**: The JSON object passed as the single argument to the entry
function.

**Result**: The value returned by the entry function. Binary values in it are
returned as `data:` URIs.

**Logs**: The console output captured from a script during one run, each entry
with a timestamp and a level (`log`, `info`, `warn`, `error`).

**Execution error**: A run that fails after the script started: the script
throws, or the run is cut off by its timeout or memory limit. As opposed to an
invalid run request. Returned together with the logs captured so far.

**Isolation mode**: How strongly one run is separated from other runs and from
the service. There are two: worker isolation and process isolation.

**Worker isolation**: The script runs in a Web Worker inside the service
process. Workers are usually reused across runs and share the service's memory.
Selected in the API by `isolation: "none"`.
_Avoid_: "no isolation" (the script is still isolated, only more weakly).

**Process isolation**: The script runs in its own short-lived operating system
process with its own memory limit, killed if it exceeds its timeout.
The default. Selected in the API by `isolation: "process"`.
