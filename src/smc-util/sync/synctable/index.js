require('ts-node').register({project:`${__dirname}/../tsconfig.json`})

exports.sync_table = require('./synctable').sync_table;