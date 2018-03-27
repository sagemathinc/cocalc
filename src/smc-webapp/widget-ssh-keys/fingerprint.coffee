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