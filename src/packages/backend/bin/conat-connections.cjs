const { conat } = require('@cocalc/backend/conat')
const { connections, usage } = require('@cocalc/conat/monitor/tables');

async function main() {
    const client = conat();
    await usage(client);
    await connections(client);
    process.exit(0);
}

main();
