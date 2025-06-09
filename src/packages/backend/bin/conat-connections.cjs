const { conat } = require('@cocalc/backend/conat')

async function main() {
    const subject = process.argv[2] ?? '>';
    console.log("watching ", {subject})
    const cn = await conat()
    const stats = await cn.call('sys').stats();
    console.log(stats);
    process.exit(0);
}

main();
