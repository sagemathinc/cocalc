###
Similar to rethink.coffee... but built around PostgreSQL.

**
This code is currently NOT released under any license for use by anybody except SageMath, Inc.

(c) 2016 SageMath, Inc.
**
---

p = (require('./postgres')).pg()

---

NOTES:

  - Some of the methods in the main class below are also in rethink.coffee.
    Since rethink will likely get deleted once postgres is up and running,
    this doesn't concern me.
  - In the first pass, I'm not worrying about indexes.  This may hurt
    scalable performance.
###

fs           = require('fs')

base = require('./postgres-base')
for f in ['pg_type', 'expire_time', 'one_result', 'all_results', 'count_result']
    exports[f] = base[f]

# Add further functionality to PostgreSQL class -- must be at the bottom of this file.
# Each of the following calls extends the PostgreSQL class with further important functionality.
# Order matters.
for module in ['base', 'server-queries', 'blobs', 'synctable', 'user-queries']
    exports.PostgreSQL = require("./postgres-#{module}").PostgreSQL

exports.db = (opts) ->
    return new exports.PostgreSQL(opts)


