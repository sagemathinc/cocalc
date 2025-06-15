const { conat } = require('@cocalc/backend/conat')
const { connections } = require('@cocalc/conat/monitor/tables');

async function main() {
    console.log("Disconnect Clients From Server")
    const ids = process.argv.slice(2);
    console.log(ids);
    const client = await conat()
    await client.call('sys.conat.server').disconnect(ids);
    process.exit(0);
}

main();
