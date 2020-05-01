#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# Adapted from https://github.com/bahamas10/node-ssh-fingerprint

crypto = require('crypto')

exports.compute_fingerprint = (pub, alg='md5') ->
    pubbuffer = new Buffer(pub, 'base64')
    key = hash(pubbuffer, alg)

    return colons(key)

# hash a string with the given alg
hash = (s, alg) ->
    return crypto.createHash(alg).update(s).digest('hex')


# add colons, 'hello' => 'he:ll:o'
colons = (s) ->
    return s.replace(/(.{2})(?=.)/g, '$1:')