const { conat } = require('@cocalc/backend/conat')
const { showUsersAndConnections } = require('@cocalc/conat/monitor/tables');

async function main() {
    const client = conat();
    await showUsersAndConnections(client, parseInt(process.argv[2] ?? '3')*1000);
    process.exit(0);
}

main();
