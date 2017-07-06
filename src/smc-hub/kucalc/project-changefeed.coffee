###
Singleton object that listens for changes to any of the following columns in the
database projects table:

 - state
 - status
 - action_request
 (maybe users?)

When any project with any of those properties changes, it fires a change
event with the project_id.
###

# maybe we don't need this!

{EventEmitter} = require('events')

misc = require('smc-util/misc')
{defaults, required} = misc

the_uniq_object = undefined
exports.project_changefeed = (opts) ->
    opts = defaults opts,
        db     : required
        logger : undefined
        cb     : required
    if the_uniq_object?
        opts.cb(undefined, the_uniq_object)
    else
        new ProjectsChangefeed opts.db, opts.logger, (err, obj) ->
            if err
                opts.cb(err)
            else
                the_uniq_object = obj
                opts.cb(undefined, the_uniq_object)

class ProjectsChangefeed extends EventEmitter
    constructor: (@db, @logger, cb) ->
        @db.changefeed
            table  : 'projects'
            select :
                state :
                status :

            required   # Map from field names to postgres data types. These must
                                # determine entries of table (e.g., primary key).
            watch  : required   # Array of field names we watch for changes
            where  : required   # Condition involving only the fields in select; or function taking obj with select and returning true or false
            cb     : required

        cb(undefined, @)











