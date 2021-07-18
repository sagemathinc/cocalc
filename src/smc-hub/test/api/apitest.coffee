#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Test suite for API interface and functionality.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
###

async  = require('async')
rimraf = require('rimraf')
temp   = require('temp')
sinon  = require('sinon')

# stub email sending
email = require('../../email')
exports.last_email = undefined
email = require('../../email')
sinon.stub(email, 'send_email').callsFake (opts) ->
    exports.last_email = opts
    opts.cb?()

pgtest = require('../postgres/pgtest')

compute_client = require('../../compute-client')
auth = require('../../auth')

exports.db = exports.account_id = exports.api_key = exports.compute_server = undefined

{http_message_api_v1} = require('../../api/handler')

exports.winston = require('./../../logger').getLogger('api_test')

# a little reset for beforeEach
exports.reset = (done) ->
    async.series([
        (cb) ->
            email.send_email.resetHistory()
            cb()
    ], done)

exports.setup = (cb) ->
    async.series([
        (cb) ->
            pgtest.setup (err) ->
                if err
                    cb(err)
                else
                    exports.db = pgtest.db
                    cb()
        (cb) ->
            temp.mkdir 'projects-test-', (err, path) ->
                process.env.COCALC_PROJECT_PATH = path
                cb(err)
        (cb) ->
            compute_client.compute_server
                database : exports.db
                dev      : true
                single   : true
                cb       : (err, compute_server) ->
                    if err
                        cb(err)
                    else
                        exports.db.compute_server = compute_server
                        exports.compute_server = compute_server
                        cb()
        (cb) ->
            exports.db.create_account
                first_name    : "Sage"
                last_name     : "CoCalc"
                created_by    : "1.2.3.4"
                email_address : "cocalc@sagemath.com"
                password_hash : auth.password_hash('blah')
                cb            : (err, account_id) ->
                    exports.account_id = account_id
                    cb(err)
        (cb) ->
            exports.db.regenerate_api_key
                account_id : exports.account_id
                cb         : (err, api_key) ->
                    exports.api_key = api_key
                    cb(err)
    ], cb)

exports.teardown = (cb) ->
    async.series([
        (cb) ->
            pgtest.teardown(cb)
        (cb) ->
            if not process.env.COCALC_PROJECT_PATH?
                cb()
                return
            #console.log "DELETING '#{process.env.COCALC_PROJECT_PATH}'"
            # Delete both with rimraf and also a few seconds after exit with shell, in case of processes
            # blocking delete or creating something as they exit.
            require('child_process').spawn("sleep 3; rm -rf '#{process.env.COCALC_PROJECT_PATH}' &", {shell:true})
            rimraf(process.env.COCALC_PROJECT_PATH, cb)
    ], cb)

exports.logger = logger =
    debug   : pgtest.log
    info    : pgtest.log
    warning : pgtest.log

exports.call = (opts) ->
    opts.database       ?= exports.db
    opts.compute_server ?= exports.compute_server
    opts.api_key        ?= exports.api_key
    opts.ip_address     ?= '1.2.3.4'
    opts.logger         ?= logger
    opts.body           ?= {}
    http_message_api_v1(opts)

