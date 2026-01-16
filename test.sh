curl -X POST http://127.0.0.1:3333 \
  -H "Content-Type: application/json" \
  -d '{
    "code": "export async function run(inputs) { console.log(JSON.stringify(inputs)); while(true) {}; return inputs; }",
    "fn": "run",
    "payload": { "a": 1, "b": 2 }
  }'