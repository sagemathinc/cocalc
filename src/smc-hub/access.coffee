
###
Access permissions related to projects
###

async   = require('async')
winston = require('winston')

misc    = require('smc-util/misc')
{defaults, required} = misc

user_is_in_project_group = (opts) ->
    opts = defaults opts,
        project_id     : required
        account_id     : undefined
        account_groups : undefined
        groups         : required
        database       : required
        cb             : required        # cb(err, true or false)
    dbg = (m) -> winston.debug("user_is_in_project_group -- #{m}")
    dbg()
    if not opts.account_id?
        dbg("not logged in, so for now we just say 'no' -- this may change soon.")
        opts.cb(undefined, false) # do not have access
        return

    access = false
    async.series([
        (cb) ->
            dbg("check if admin or in appropriate group -- #{misc.to_json(opts.account_groups)}")
            if opts.account_groups? and 'admin' in opts.account_groups  # check also done below!
                access = true
                cb()
            else
                opts.database.user_is_in_project_group
                    project_id     : opts.project_id
                    account_id     : opts.account_id
                    groups         : opts.groups
                    cb             : (err, x) ->
                        access = x
                        cb(err)
        (cb) ->
            if access
                cb() # done
            else if opts.account_groups?
                # already decided above
                cb()
            else
                # User does not have access in normal way and account_groups not provided, so
                # we do an extra group check before denying user.
                opts.database.get_account
                    columns    : ['groups']
                    account_id : opts.account_id
                    cb         : (err, r) ->
                        if err
                            cb(err)
                        else
                            access = 'admin' in (r['groups'] ? [])
                            cb()
        ], (err) ->
            dbg("done with tests -- now access=#{access}, err=#{err}")
            opts.cb(err, access)
        )

exports.user_has_write_access_to_project = (opts) ->
    opts.groups = ['owner', 'collaborator']
    user_is_in_project_group(opts)

exports.user_has_read_access_to_project = (opts) ->
    # Read access is granted if user is in any of the groups listed below (owner, collaborator, or *viewer*).
    #dbg = (m) -> winston.debug("user_has_read_access_to_project #{opts.project_id}, #{opts.account_id}; #{m}")
    opts.groups = ['owner', 'collaborator', 'viewer']
    user_is_in_project_group(opts)
