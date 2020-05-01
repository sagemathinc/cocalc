#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

fs      = require('fs')
winston = require('winston')
misc    = require('smc-util/misc')
kucalc  = require('./kucalc')

exports.secret_token_filename = ->
    if kucalc.IN_KUCALC
        return process.env.COCALC_SECRET_TOKEN
    else
        return "#{process.env.SMC}/secret_token"

_secret_token = undefined
exports.secret_token = ->  # doing sync is ok since only happens rarely at startup and is quick
    return _secret_token ?= fs.readFileSync(exports.secret_token_filename())

# We make it an error for a client to try to edit a file larger than MAX_FILE_SIZE.
# I decided on this, because attempts to open a much larger file leads
# to disaster.  Opening a 10MB file works but is a just a little slow.
MAX_FILE_SIZE = 10000000   # 10MB
exports.check_file_size = (size) ->
    if size? and size > MAX_FILE_SIZE
        e = "Attempt to open large file of size #{Math.round(size/1000000)}MB; the maximum allowed size is #{Math.round(MAX_FILE_SIZE/1000000)}MB. Use vim, emacs, or pico from a terminal instead."
        winston.debug(e)
        return e

exports.json = (out) ->
    misc.trunc(misc.to_json(out),500)