# Copy Path Provider
# Used in the "Client"

async                = require('async')
message              = require('smc-util/message')
access               = require('./access')
misc                 = require('smc-util/misc')

sanitize = (val, deflt, max, name) ->
    if val?
        o = parseInt(val)
        if isNaN(o) or o < 0 or o > max
            throw new Error("ILLEGAL VALUE #{name}='#{val}' (must be in [0, #{max}])")
        return o
    else
        return deflt


class exports.CopyPath

    constructor: (client) ->
        @client = client
        @dbg = (method) ->
            @client.dbg("CopyPath::#{method}")

    copy: (mesg) =>
        @client.touch()
        if not mesg.src_project_id?
            @client.error_to_client(id:mesg.id, error:"src_project_id must be defined")
            return
        if not mesg.target_project_id?
            @client.error_to_client(id:mesg.id, error:"target_project_id must be defined")
            return
        if not mesg.src_path?
            @client.error_to_client(id:mesg.id, error:"src_path must be defined")
            return

        locals =
            copy_id : undefined

        async.series([
            (cb) =>
                # Check permissions for the source and target projects (in parallel) --
                # need read access to the source and write access to the target.
                async.parallel([
                    (cb) =>
                        access.user_has_read_access_to_project
                            project_id     : mesg.src_project_id
                            account_id     : @client.account_id
                            account_groups : @client.groups
                            database       : @client.database
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have read access to source project #{mesg.src_project_id}")
                                else
                                    cb()
                    (cb) =>
                        access.user_has_write_access_to_project
                            database       : @client.database
                            project_id     : mesg.target_project_id
                            account_id     : @client.account_id
                            account_groups : @client.groups
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have write access to target project #{mesg.target_project_id}")
                                else
                                    cb()
                ], cb)

            (cb) =>
                # do the copy
                @client.compute_server.project
                    project_id : mesg.src_project_id
                    cb         : (err, project) =>
                        if err
                            cb(err); return
                        else
                            project.copy_path
                                path              : mesg.src_path
                                target_project_id : mesg.target_project_id
                                target_path       : mesg.target_path
                                overwrite_newer   : mesg.overwrite_newer
                                delete_missing    : mesg.delete_missing
                                backup            : mesg.backup
                                timeout           : mesg.timeout
                                exclude_history   : mesg.exclude_history
                                wait_until_done   : mesg.wait_until_done
                                scheduled         : mesg.scheduled
                                cb                : (err, copy_id) =>
                                    if err
                                        cb(err)
                                    else
                                        locals.copy_id = copy_id
                                        cb()
        ], (err) =>
            if err
                @client.error_to_client(id:mesg.id, error:err)
            else
                # we only expect a copy_id in kucalc mode
                if locals.copy_id?
                    resp = message.copy_path_between_projects_response
                                                        id           : mesg.id
                                                        copy_path_id : locals.copy_id
                    @client.push_to_client(resp)
                else
                    @client.push_to_client(message.success(id:mesg.id))
        )



    status: (mesg) =>
        @client.touch()
        dbg = @dbg('mesg_copy_path_status')
        # src_project_id, target_project_id and optionally src_path + offset (limit is 1000)
        search_many = mesg.src_project_id? or mesg.target_project_id?
        if not search_many and not mesg.copy_path_id?
            @client.error_to_client(id:mesg.id, error:"'copy_path_id' (UUID) of a copy operation or 'src_project_id/target_project_id' must be defined")
            return
        if search_many
            @_mesg_copy_path_status_query(mesg)
        else
            @_mesg_copy_path_status_single(mesg)



    _mesg_copy_path_status_query: (mesg) =>
        locals =
            allowed   : true   # this is not really necessary
            copy_ops  : []

        dbg = @dbg('status_query')

        async.series([
            (cb) =>
                if not mesg.src_project_id?
                    cb()
                    return
                access.user_has_read_access_to_project
                    project_id     : mesg.src_project_id
                    account_id     : @client.account_id
                    account_groups : @client.groups
                    database       : @client.database
                    cb             : (err, result) =>
                        if err
                            cb(err)
                        else if not result
                            locals.allowed = false
                            cb("ACCESS BLOCKED -- No read access to source project")
                        else
                            cb()
            (cb) =>
                if not mesg.target_project_id?
                    cb()
                    return
                access.user_has_write_access_to_project
                    database       : @client.database
                    project_id     : mesg.target_project_id
                    account_id     : @client.account_id
                    account_groups : @client.groups
                    cb             : (err, result) =>
                        if err
                            cb(err)
                        else if not result
                            locals.allowed = false
                            cb("ACCESS BLOCKED -- No write access to target project")
                        else
                            cb()
            (cb) =>
                if not locals.allowed
                    cb('Not allowed')
                    return

                where = [
                    "source_project_id = $::UUID" : mesg.src_project_id,
                    "target_project_id = $::UUID" : mesg.target_project_id
                ]

                if mesg.src_path?
                    where.push("source_path = $" : mesg.src_path)

                # all failed ones are implicitly also finished
                if mesg.failed == true or mesg.failed == 'true'
                    where.push("error IS NOT NULL")
                    mesg.pending = false

                if mesg.pending == true
                    where.push("finished IS NULL")

                # sanitizing input!
                try
                    offset = sanitize(mesg.offset, 0, 100, 'offset')
                    limit  = sanitize(mesg.limit, 1000, 1000, 'limit')
                catch err
                    dbg(err.message)
                    cb(err.message)
                    return

                dbg("offset=#{offset}   limit=#{limit}")


                @client.database._query
                    query    : "SELECT * FROM copy_paths"
                    where    : where
                    offset   : offset
                    limit    : limit
                    order_by : 'time DESC'
                    cb       : (err, x) =>
                        if err?
                            cb(err)
                        else if not x?
                            cb("Can't find copy operations for given src_project_id/target_project_id")
                        else
                            for row in x.rows
                                # be explicit about what we return
                                locals.copy_ops.push(@_get_copy_op_data(row))
                            cb()
        ], (err) =>
            if err
                @client.error_to_client(id:mesg.id, error:err)
            else
                @client.push_to_client(message.copy_path_status_response(id:mesg.id, data:locals.copy_ops))
        )


    _get_copy_path_status_single: (mesg, cb) =>
        if not mesg.copy_path_id?
            cb("ERROR: copy_path_id missing")
            return

        dbg = @dbg("_get_copy_path_status_single")
        locals =
            copy_op : undefined
        async.series([
            # get the info
            (cb) =>
                {one_result} = require('./postgres')
                where = ["id = $::UUID" : mesg.copy_path_id]
                if mesg.not_yet_done
                    where.push("scheduled IS NOT NULL")
                    where.push("finished IS NULL")
                @client.database._query
                    query : "SELECT * FROM copy_paths"
                    where : where
                    cb    : one_result (err, x) =>
                        if err?
                            cb(err)
                        else if not x?
                            if mesg.not_yet_done
                                cb("Copy operation '#{mesg.copy_path_id}' either does not exist or already finished")
                            else
                                cb("Can't find copy operation with ID=#{mesg.copy_path_id}")
                        else
                            locals.copy_op = x
                            dbg("copy_op=#{misc.to_json(locals.copy_op)}")
                            cb()

            (cb) =>
                # now we prevent someone who was kicked out of a project to check the copy status
                target_project_id = locals.copy_op.target_project_id
                source_project_id = locals.copy_op.source_project_id
                async.parallel([
                    (cb) =>
                        access.user_has_read_access_to_project
                            project_id     : source_project_id
                            account_id     : @client.account_id
                            account_groups : @client.groups
                            database       : @client.database
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("ACCESS BLOCKED -- No read access to source project of this copy operation")
                                else
                                    cb()
                    (cb) =>
                        access.user_has_write_access_to_project
                            database       : @client.database
                            project_id     : target_project_id
                            account_id     : @client.account_id
                            account_groups : @client.groups
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("ACCESS BLOCKED -- No write access to target project of this copy operation")
                                else
                                    cb()
                ], cb)
        ], (err) =>
            cb(err, locals.copy_op)
        )

    _mesg_copy_path_status_single: (mesg) =>
         @_get_copy_path_status_single(mesg, (err, copy_op) =>
            if err
                @client.error_to_client(id:mesg.id, error:err)
            else
                # be explicit about what we return
                data = @_get_copy_op_data(copy_op)
                @client.push_to_client(message.copy_path_status_response(id:mesg.id, data:data))
        )

    _get_copy_op_data: (copy_op) =>
        return
            copy_path_id       : copy_op.id
            time               : copy_op.time
            source_project_id  : copy_op.source_project_id
            source_path        : copy_op.source_path
            target_project_id  : copy_op.target_project_id
            target_path        : copy_op.target_path
            overwrite_newer    : copy_op.overwrite_newer
            delete_missing     : copy_op.delete_missing
            backup             : copy_op.backup
            started            : copy_op.started
            finished           : copy_op.finished
            scheduled          : copy_op.scheduled
            error              : copy_op.error

    delete: (mesg) =>
        @client.touch()
        dbg = @dbg('mesg_copy_path_delete')
        # this filters possible results
        mesg.not_yet_done = true
        @_get_copy_path_status_single(mesg, (err, copy_op) =>
            if err
                @client.error_to_client(id:mesg.id, error:err)
            else if not copy_op?
                @client.error_to_client(id:mesg.id, error:"copy op '${mesg.copy_path_id}' cannot be deleted.")
            else
                @client.database._query
                    query : "DELETE FROM copy_paths"
                    where : "id = $::UUID" : mesg.copy_path_id
                    cb    : (err, x) =>
                        if err?
                            @client.error_to_client(id:mesg.id, error:err)
                        else
                            @client.push_to_client(message.copy_path_status_response(
                                id:mesg.id,
                                data:"copy_path_id = '#{mesg.copy_path_id}' deleted")
                            )
        )
