###
The share express server.
###

# Enable transparent server-side requiring of cjsx files.
# We need this until all frontend smc-webapp code (used by the
# share server) is converted to not be cjsx.  Note that any
# frontend cjsx that uses coffeescript2 features like async/await
# will break, due to node-cjsx being so old and burried.
require('node-cjsx').transform()

exports.share_router = require('./router').share_router