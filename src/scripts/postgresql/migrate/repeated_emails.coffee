#!/usr/bin/env coffee

###
Ugly one-off code to ensure no two accounts have the same email address
###

require('smc-hub/rethink').rethinkdb
    password : require('fs').readFileSync('/migrate/secrets/rethinkdb').toString().trim()
    hosts  : ['db4']
    cb : (err, db) =>
        if err
            console.log("err getting db", err)
        else
            fix_duplicate_emails(db)

cmp = (a, b) ->
    a ?= 0
    b ?= 0
    if a < b
        return -1
    else if a > b
        return 1
    return 0

cmp_users = (user1, user2) ->
    c = cmp(user1.last_active, user2.last_active)
    if c
        return c
    return cmp(user1.created, user2.created)

async = require('async')
fix_duplicate_emails = (db) ->
    console.log 'Fix duplicate emails.'
    users = undefined
    multi = []
    async.series([
        (cb) ->
            console.log 'Reading all users from database:'
            db.table('accounts').pluck('account_id', 'email_address', 'last_active', 'created').run (err, x) ->
                users = x; cb(err)
        (cb) ->
            console.log "Processing #{users.length} users"
            by_email = {}
            for user in users
                if user.email_address
                    (by_email[user.email_address] ?= []).push(user)
            multi = (v for _, v of by_email when v.length > 1)
            console.log "found #{multi.length} users with more than one email address"
            console.log(multi)
            process_it = (v, cb) ->
                v.sort(cmp_users)
                console.log("process ", v)
                del = (x, cb) ->
                    account_id = x.account_id
                    console.log "deleting #{account_id}"
                    db.mark_account_deleted(account_id:account_id, cb:cb)
                async.mapSeries(v.slice(0,v.length-1), del, cb)
            async.mapSeries(multi, process_it, cb)
    ],(err) ->
        if err
            console.log("ERROR", err)
            process.exit(1)
        else
            console.log('done')
            process.exit(0)
    )



