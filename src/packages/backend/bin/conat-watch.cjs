const { conat } = require('@cocalc/backend/conat')

async function main() {
    const subject = process.argv[2] ?? '>';
    console.log("watching ", {subject})
    const cn = await conat()
    cn.watch(subject)
}

main();
