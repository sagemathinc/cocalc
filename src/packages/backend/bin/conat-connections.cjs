const { conat } = require('@cocalc/backend/conat')
const { showUsersAndStats } = require('@cocalc/conat/monitor/tables');
const { conatServer } = require('@cocalc/backend/data')
const { delay } = require("awaiting");

async function main() {
    console.log("Connecting to", conatServer);
    const maxMessages = process.argv[2] ? parseInt(process.argv[2]) : undefined;
    const maxWait = process.argv[3] ? parseInt(process.argv[3]) : 3000;
    const client = conat();
    await client.waitUntilSignedIn();
    await delay(1000);
    if(!maxMessages) {
        console.log("\nUsage: pnpm conat-connnections [num-servers] [max-wait-ms]\n")
    }
    await showUsersAndStats({client, maxWait, maxMessages});
    process.exit(0);
}

main();
