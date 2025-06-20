const {main} = require('@cocalc/backend/nats/sync')

const start = parseInt(process.argv[2])
const stop = parseInt(process.argv[3])
const ncpu = parseInt(process.argv[4])

main({start, stop, ncpu})
