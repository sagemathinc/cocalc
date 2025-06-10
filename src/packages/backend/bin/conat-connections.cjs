const { conat } = require('@cocalc/backend/conat')
const { showUsersAndStats } = require('@cocalc/conat/monitor/tables');
const { conatServer } = require('@cocalc/backend/data')

async function main() {
    console.log("Connecting to", conatServer);
    const client = conat();
    await showUsersAndStats(client, parseInt(process.argv[2] ?? '3')*1000);
    process.exit(0);
}

main();
