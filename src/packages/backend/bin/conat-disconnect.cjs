const { conat } = require('@cocalc/backend/conat')
const { connections } = require('@cocalc/conat/monitor/tables');
const { sysApi } = require("@cocalc/conat/core/sys");
const { delay } = require("awaiting");

async function main() {
    console.log("Disconnect Clients From Server")
    const ids = process.argv.slice(2);
    console.log(ids);
    const client = await conat()
    await client.waitUntilSignedIn();
    await delay(1000);
    const sys = sysApi(client);
    await sys.disconnect(ids);
    process.exit(0);
}

main();
