###
secret_token.coffee -- Generate the "secret_token" file if it does not already
exist.  All connections to all local-to-the user services that
SageMathClouds starts must be prefixed with this key.

SageMathCloud: Collaborative web-based SageMath, Jupyter, LaTeX and Terminals.
Copyright 2015, SageMath, Inc., GPL v3.
###

fs = require('fs')

async = require('async')
winston = require('winston')

common = require('./common')

# We use an n-character cryptographic random token, where n is given below.  If you
# want to change this, changing only the following line should be safe.
secret_token_length = 128

exports.init_secret_token = (cb) ->
    winston.debug("initializing secret token")
    the_secret_token = undefined
    async.series([
        (cb) ->
            winston.debug("check for SMC_SECRET_TOKEN environment variable")
            if process.env['SMC_SECRET_TOKEN']?
                winston.debug("found SMC_SECRET_TOKEN environment variable")
                the_secret_token = process.env['SMC_SECRET_TOKEN']
                delete process.env['SMC_SECRET_TOKEN']
                fs.writeFile(common.secret_token_filename, the_secret_token, cb)
            else
                cb()
        (cb) ->
            if the_secret_token?
                cb()
                return
            winston.debug("read the secret token file...")
            fs.readFile common.secret_token_filename, (err, data) ->
                if err
                    winston.debug("create '#{common.secret_token_filename}'")
                    require('crypto').randomBytes  secret_token_length, (err, data) ->
                        if err
                            cb(err)
                        else
                            the_secret_token = data.toString('base64')
                            fs.writeFile(common.secret_token_filename, the_secret_token, cb)
                else
                    the_secret_token = data.toString()
                    cb()
        (cb) ->
            # Ensure restrictive permissions on the secret token file, just in case.
            # TODO: can this be combined with writeFile above to avoid a potential security issue?
            fs.chmod(common.secret_token_filename, 0o600, cb)
    ], (err) ->
        winston.debug("got secret token = #{the_secret_token}")
        cb(err, the_secret_token)
    )