###
secret_token.coffee -- Generate the "secret_token" file if it does not already
exist.  All connections to all local-to-the user services that
CoCalcs starts must be prefixed with this key.

CoCalc: Collaborative web-based SageMath, Jupyter, LaTeX and Terminals.
Copyright 2015, SageMath, Inc., GPL v3.
###

fs = require('fs')

async = require('async')
winston = require('winston')

common = require('./common')

# We use an n-character cryptographic random token, where n is given below.  If you
# want to change this, changing only the following line should be safe.
secret_token_length = 128

create_secret_token = (cb) ->
    winston.debug("create '#{common.secret_token_filename()}'")
    value = undefined
    async.series([
        (cb) ->
            require('crypto').randomBytes secret_token_length, (ex, data) ->
                value = data.toString('base64')
                fs.writeFile(common.secret_token_filename(), value, cb)
        (cb) ->
            # Ensure restrictive permissions on the secret token file, just in case.
            fs.chmod(common.secret_token_filename(), 0o600, cb)
    ], (err) ->
        if err
            cb(err)
        else
            cb(undefined, value)
    )

exports.init_secret_token = (cb) ->
    winston.debug("initializing secret token")
    fs.readFile common.secret_token_filename(), (err, data) ->
        if err
            create_secret_token(cb)
        else
            cb(undefined, data.toString())


