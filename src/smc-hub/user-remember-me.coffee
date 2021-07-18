#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
A cached function from remember_me cookie to account_id.
Cache expires after 60s, to stop accepting requests from user
in case they invalidate their cookie.
###

Cache = require('lru-cache')

auth    = require('./auth')

# Do NOT change this - this exact string is assumed in smc-util/client
{NOT_SIGNED_IN} = require("smc-util/consts")

remember_me_cache = new Cache(max:5000, maxAge:60000)

exports.get_account_id = (database, remember_me, cb) ->
    if not remember_me?
        cb(NOT_SIGNED_IN)
        return
    account_id = remember_me_cache.get(remember_me)
    if account_id
        cb(undefined, account_id)
        return
    x = remember_me.split('$')
    try
        hash = auth.generate_hash(x[0], x[1], x[2], x[3])
    catch err
        cb(NOT_SIGNED_IN)
        return
    database.get_remember_me
        hash : hash
        cb   : (err, signed_in_mesg) ->
            if err
                cb(err)
                return
            remember_me_cache.set(remember_me, signed_in_mesg?.account_id)
            if not signed_in_mesg?
                cb(NOT_SIGNED_IN)
            else
                cb(undefined, signed_in_mesg.account_id)