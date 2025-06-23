/*
run a persist server
*/

const { conat } = require('@cocalc/backend/conat')
require('@cocalc/backend/conat/persist');
const {server} = require('@cocalc/conat/persist/server');

async function main() {
  const client = await conat()
  server({client});
}

main();
