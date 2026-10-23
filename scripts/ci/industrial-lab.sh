#!/usr/bin/env bash
set -euo pipefail
# Use an isolated database process. Never point this runner at a production database.
if [[ -z "${INDUSTRIAL_TEST_MONGO_URI:-}" ]]; then
  : "${MONGOD_BINARY:?Set MONGOD_BINARY to an installed mongod binary}"
  industrial_lab_dir=$(mktemp -d)
  industrial_lab_port=${INDUSTRIAL_TEST_MONGO_PORT:-27028}
  "$MONGOD_BINARY" --dbpath "$industrial_lab_dir" --port "$industrial_lab_port" \
    --bind_ip 127.0.0.1 --replSet industrial-lab --nounixsocket \
    --setParameter diagnosticDataCollectionEnabled=false --logpath "$industrial_lab_dir/mongod.log" &
  industrial_lab_pid=$!
  trap 'kill "$industrial_lab_pid" 2>/dev/null || true; wait "$industrial_lab_pid" 2>/dev/null || true; rm -rf "$industrial_lab_dir"' EXIT
  export INDUSTRIAL_TEST_MONGO_URI="mongodb://127.0.0.1:${industrial_lab_port}/?replicaSet=industrial-lab"
  export INDUSTRIAL_TEST_MONGO_PORT="$industrial_lab_port"
  node --input-type=module - <<'JS'
import {MongoClient} from 'mongodb';
const port=process.env.INDUSTRIAL_TEST_MONGO_PORT;
const client=await MongoClient.connect(`mongodb://127.0.0.1:${port}/?directConnection=true`);
try {
 await client.db('admin').command({replSetInitiate:{_id:'industrial-lab',members:[{_id:0,host:`127.0.0.1:${port}`}]}});
 let writable=false;
 for(let i=0;i<100;i++){if((await client.db('admin').command({hello:1})).isWritablePrimary){writable=true;break;}await new Promise(r=>setTimeout(r,100));}
 if(!writable)throw new Error('Replica set did not become writable');
}finally{await client.close();}
JS
fi
node node_modules/vitest/vitest.mjs run tests/integration/industrial-mongo.test.ts tests/integration/industrial-wire-chain.test.ts
