require('@cocalc/backend/conat')
const { inventory } = require('@cocalc/backend/conat/sync')

async function main() {
    console.log("\n\nUsage: pnpm conat-inventory project_id [filter] --notrunc\n\n")
    const project_id = process.argv[2];
    if(!project_id) {
        process.exit(1);
    }
    const filter = process.argv[3];
    const noTrunc = !!process.argv[4]
    const i = await inventory({project_id})
    await i.ls({filter, noHelp:true, noTrunc});
    process.exit(0);
}

main();
