###
The share express server.
###

# Enable transparent server-side requiring of cjsx files.
require('node-cjsx').transform()

exports.share_router = require('./router.cjsx').share_router