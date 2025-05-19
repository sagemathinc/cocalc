const { getEnv } = require('@cocalc/backend/conat')

async function main() {
    const subject = process.argv[2] ?? '>';
    console.log("watching ", {subject})
    const {cn} = await getEnv()
    cn.watch(subject)
}

main();
