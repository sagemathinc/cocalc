###
Synchronized file editing sessions.
###

fs      = require('fs')

async   = require('async')
winston = require('winston')
uuid    = require('node-uuid')


{DiffSyncFile_server, DiffSyncFile_client} = require('./diffsync_file')
diffsync     = require('smc-util/diffsync')

message      = require('smc-util/message')
misc_node    = require('smc-util-node/misc_node')
misc         = require('smc-util/misc')

{defaults, required} = misc

sage_session = require('./sage_session')
common = require('./common')
blobs  = require('./blobs')

json = common.json

###
# Revision tracking misc.
###

# Save the revision_tracking info for a file to disk *at most* this frequently.
# NOTE: failing to save to disk would only mean missing a patch but should
# otherwise *NOT* corrupt the history.
REVISION_TRACKING_SAVE_INTERVAL_S = 45   # 45 seconds

# Filename of revision tracking file associated to a given file
revision_tracking_path = (path) ->
    s = misc.path_split(path)
    return "#{s.head}/.#{s.tail}.sage-history"

###
NOTE: These have *nothing* a priori to do with CodeMirror -- the name is
historical and should be changed.  However, this will vanish with the rewrite
to use the new sync, so there is no point.
###

###
The CodeMirrorDiffSyncHub class represents a downstream
remote client for this local hub.  There may be dozens of these.
The local hub has no upstream server, except the on-disk file itself.
###

class CodeMirrorDiffSyncHub
    constructor : (@socket, @session_uuid, @client_id) ->

    write_mesg: (event, obj) =>
        if not obj?
            obj = {}
        obj.session_uuid = @session_uuid
        mesg = message['codemirror_' + event](obj)
        mesg.client_id = @client_id
        @socket.write_mesg('json', mesg)

    recv_edits : (edit_stack, last_version_ack, cb) =>
        @write_mesg 'diffsync',
            id               : @current_mesg_id
            edit_stack       : edit_stack
            last_version_ack : last_version_ack
        cb?()

    sync_ready: () =>
        @write_mesg('diffsync_ready')

class CodeMirrorSession
    constructor: (mesg, cb) ->
        @path = mesg.path
        @session_uuid = mesg.session_uuid
        dbg = @dbg("constructor(path='#{@path}',session_uuid='#{@session_uuid}')")
        dbg("creating session defined by #{misc.to_json(mesg)}")
        @_sage_output_cb = {}
        @_sage_output_to_input_id = {}

        # The downstream clients of this local hub -- these are global hubs that proxy requests on to browser clients
        @diffsync_clients = {}
        dbg("working directory: #{process.cwd()}")

        async.series([
            (cb) =>
                dbg("if file doesn't exist, try to create it.")
                fs.exists @path, (exists) =>
                    if exists
                        dbg("file exists")
                        cb()
                    else
                        dbg("try to create file")
                        fs.open @path,'w', (err, fd) =>
                            if err
                                cb(err)
                            else
                                fs.close(fd, cb)
            (cb) =>
                if @path.indexOf('.snapshots/') != -1
                    dbg("in snapshots path, so setting to readonly")
                    @readonly = true
                    cb()
                else
                    dbg("check if file is readonly")
                    misc_node.is_file_readonly
                        path : @path
                        cb   : (err, readonly) =>
                            dbg("readonly got: #{err}, #{readonly}")
                            @readonly = readonly
                            cb(err)
            (cb) =>
                # If this is a non-readonly sagews file, create corresponding sage session.
                if not @readonly and misc.filename_extension_notilde(@path) == 'sagews'
                    @process_new_content = @sage_update
                    @sage_socket(cb)
                else
                    cb()
            (cb) =>
                # The *actual* file on disk.  It's important to create this
                # after successfully getting the sage socket, since if we fail to
                # get the sage socket we end up creating too many fs.watch's on this file...
                @diffsync_fileserver = new DiffSyncFile_server @, (err, content) =>
                    if err
                        cb(err); return
                    @content = content
                    @diffsync_fileclient = new DiffSyncFile_client(@diffsync_fileserver)

                    # worksheet freshly loaded from disk -- now ensure no cells appear to be running
                    # except for the auto cells that we spin up running.
                    @sage_update(kill:true, auto:true)
                    @_set_content_and_sync()

                    cb()
        ], (err) => cb?(err, @))

    dbg: (f) ->
        return (m) -> winston.debug("CodeMirrorSession.#{f}: #{m}")

    ##############################
    # Sage execution related code
    ##############################
    sage_socket: (cb) =>  # cb(err, socket)
        if @_sage_socket?
            try
                process.kill(@_sage_socket.pid, 0)
                # process is still running fine
                cb(false, @_sage_socket)
                return
            catch e
                # sage process is dead.
                @_sage_socket = undefined

        winston.debug("sage_socket: initalize the newly started sage process")

        # If we've already loaded the worksheet, then ensure
        # that no cells appear to be running.  This is important
        # because the worksheet file that we just loaded could have had some
        # markup that cells are running.
        if @diffsync_fileclient?
            @sage_update(kill:true)

        winston.debug("sage_socket: connecting to the local Sage server....")
        sage_session.get_sage_socket (err, socket) =>
            if err
                winston.debug("sage_socket: fail -- #{err}.")
                cb(err)
            else
                winston.debug("sage_socket: successfully opened a Sage session for worksheet '#{@path}'")
                @_sage_socket = socket

                # Set path to be the same as the file.
                mesg = message.execute_code
                    id       : misc.uuid()
                    code     : "os.chdir(salvus.data['path']);__file__=salvus.data['file']"
                    data     : {path: misc.path_split(@path).head, file:misc_node.abspath(@path)}
                    preparse : false
                socket.write_mesg('json', mesg)

                socket.on 'end', () =>
                    @_sage_socket = undefined
                    winston.debug("codemirror session #{@session_uuid} sage socket terminated.")

                socket.on 'mesg', (type, mesg) =>
                    #winston.debug("sage session: received message #{type}, #{misc.to_json(mesg)}")
                    switch type
                        when 'blob'
                            sha1 = mesg.uuid
                            if @diffsync_clients.length == 0
                                error = 'no global hubs are connected to the local hub, so nowhere to send file'
                                winston.debug("codemirror session: got blob from sage session -- #{error}")
                                resp =  message.save_blob
                                    error  : error
                                    sha1   : sha1
                                socket.write_mesg('json', resp)
                            else
                                winston.debug("codemirror session: got blob from sage session -- forwarding to a random hub")
                                # TODO: should use any hub connected to this project, not just hubs involved in diffsync?
                                hub = misc.random_choice_from_obj(@diffsync_clients)
                                client_id = hub[0]; ds_client = hub[1]
                                mesg.client_id = client_id
                                ds_client.remote.socket.write_mesg('blob', mesg)

                                blobs.receive_save_blob_message
                                    sha1 : sha1
                                    cb   : (resp) -> socket.write_mesg('json', resp)

                                ## DEBUG -- for testing purposes -- simulate the response message
                                ## handle_save_blob_message(message.save_blob(sha1:sha1,ttl:1000))

                        when 'json'
                            # First check for callbacks (e.g., used in interact and things where the
                            # browser directly asks to evaluate code in this session).
                            c = @_sage_output_cb[mesg.id]
                            if c?
                                c(mesg)
                                if mesg.done
                                    delete @_sage_output_cb[mesg.id]
                                return

                            # Handle code execution in browser messages
                            if mesg.event == 'execute_javascript'
                                # winston.debug("got execute_javascript message from sage session #{json(mesg)}")
                                # Wrap and forward it on as a broadcast message.
                                mesg.session_uuid = @session_uuid
                                bcast = message.codemirror_bcast
                                    session_uuid : @session_uuid
                                    mesg         : mesg
                                @client_bcast(undefined, bcast)
                                return

                            # Finally, handle output messages
                            m = {}
                            for x, y of mesg
                                if x != 'id' and x != 'event'  # the event is always "output"
                                    if x == 'done'   # don't bother with done=false
                                        if y
                                            m[x] = y
                                    else
                                        m[x] = y

                            #winston.debug("sage --> local_hub: '#{json(mesg)}'")

                            before = @content
                            @sage_output_mesg(mesg.id, m)
                            if before != @content
                                @_set_content_and_sync()

                # If we've already loaded the worksheet, submit all auto cells to be evaluated.
                if @diffsync_fileclient?
                    @sage_update(auto:true)

                cb(false, @_sage_socket)

    _set_content_and_sync: () =>
        if @set_content(@content)
            # Content actually changed, so suggest to all connected clients to sync.
            for id, ds_client of @diffsync_clients
                ds_client.remote.sync_ready()

    sage_execute_cell: (id) =>
        winston.debug("exec request for cell with id: '#{id}'")
        @sage_remove_cell_flag(id, diffsync.FLAGS.execute)
        {code, output_id} = @sage_initialize_cell_for_execute(id)
        winston.debug("exec code '#{code}'; output id='#{output_id}'")

        #if diffsync.FLAGS.auto in @sage_get_cell_flagstring(id) and 'auto' not in code
        #@sage_remove_cell_flag(id, diffsync.FLAGS.auto)

        @set_content(@content)
        if code != ""
            @_sage_output_to_input_id[output_id] = id
            winston.debug("start running -- #{id}")

            # Change the cell to "running" mode - this doesn't generate output, so we
            # must explicit force clients to sync.
            @sage_set_cell_flag(id, diffsync.FLAGS.running)
            @sage_set_cell_flag(id, diffsync.FLAGS.this_session)
            @_set_content_and_sync()

            @sage_socket (err, socket) =>
                if err
                    winston.debug("Error getting sage socket: #{err}")
                    @sage_output_mesg(output_id, {stderr: "Error getting sage socket (unable to execute code): #{err}"})
                    @sage_remove_cell_flag(id, diffsync.FLAGS.running)
                    return
                winston.debug("Sending execute message to sage socket.")
                socket.write_mesg 'json',
                    message.execute_code
                        id       : output_id
                        cell_id  : id         # extra info -- which cell is running
                        code     : code
                        preparse : true

    # Execute code in the Sage session associated to this sync'd editor session
    sage_execute_code: (client_socket, mesg) =>
        #winston.debug("sage_execute_code '#{misc.to_json(mesg)}")
        client_id = mesg.client_id

        if mesg.output_uuid?
            output_line = diffsync.MARKERS.output
            append_message = (resp) =>
                i = @content.indexOf(diffsync.MARKERS.output + mesg.output_uuid)
                #winston.debug("sage_execute_code: append_message i=#{i}, thing='#{diffsync.MARKERS.output+mesg.output_uuid}', @content='#{@content}'")
                if i == -1  # no cell anymore
                    return
                i = i + 37
                n = @content.indexOf('\n', i)
                #winston.debug("sage_execute_code: append_message n=#{n}")
                if n == -1   # corrupted
                    return
                output_line += misc.to_json(misc.copy_without(resp, ['id', 'client_id', 'event'])) + diffsync.MARKERS.output
                #winston.debug("sage_execute_code: i=#{i}, n=#{n}, output_line.length=#{output_line.length}, output_line='#{output_line}'")
                if output_line.length > n - i
                    #winston.debug("sage_execute_code: initiating client didn't maintain sync promptly. fixing")
                    x = @content.slice(0, i)
                    @content = x + output_line + @content.slice(n)
                    if resp.done
                        j = x.lastIndexOf(diffsync.MARKERS.cell)
                        if j != -1
                            j = x.lastIndexOf('\n', j)
                            cell_id = x.slice(j+2, j+38)
                            @sage_remove_cell_flag(cell_id, diffsync.FLAGS.running)
                    @_set_content_and_sync()

        @_sage_output_cb[mesg.id] = (resp) =>
            #winston.debug("sage_execute_code -- got output: #{misc.to_json(resp)}")
            if mesg.output_uuid?
                setTimeout((=>append_message(resp)), 5000)
            # tag response for the client who requested it
            resp.client_id = client_id
            # send response
            client_socket.write_mesg('json', resp)

        @sage_socket (err, socket) =>
            #winston.debug("sage_execute_code: #{misc.to_json(err)}, #{socket}")
            if err
                #winston.debug("Error getting sage socket: #{err}")
                resp = message.output(stderr: "Error getting sage socket (unable to execute code): #{err}", done:true)
                client_socket.write_mesg('json', resp)
            else
                #winston.debug("sage_execute_code: writing request message -- #{misc.to_json(mesg)}")
                mesg.event = 'execute_code'   # event that sage session understands
                socket.write_mesg('json', mesg)

    sage_raw_input: (client_socket, mesg) =>
        winston.debug("sage_raw_input '#{misc.to_json(mesg)}")
        @sage_socket (err, socket) =>
            if err
                winston.debug("sage_raw_input: error getting sage socket -- #{err}")
            else
                socket.write_mesg('json', mesg)

    sage_call: (opts) =>
        opts = defaults opts,
            mesg : required
            cb   : undefined

        f = (resp) =>
            opts.cb?(false, resp)
            delete @_sage_output_cb[opts.mesg.id]   # exactly one response

        @sage_socket (err, socket) =>
            if err
                opts.cb?("error getting sage socket -- #{err}")
            else
                @_sage_output_cb[opts.mesg.id] = f
                socket.write_mesg('json', opts.mesg)

    sage_introspect: (client_socket, mesg) =>
        mesg.event = 'introspect' # event that sage session understand
        @sage_call
            mesg : mesg
            cb : (err, resp) =>
                if err
                    resp = message.error(error:"Error getting sage socket (unable to introspect): #{err}")
                    client_socket.write_mesg('json', resp)
                else
                    client_socket.write_mesg('json', resp)

    send_signal_to_sage_session: (client_socket, mesg) =>
        if @_sage_socket?
            misc_node.process_kill(@_sage_socket.pid, mesg.signal)
        if mesg.id? and client_socket?
            client_socket.write_mesg('json', message.success(id:mesg.id))

    restart: (client_socket, mesg) =>
        winston.debug("sage_session.restart")
        if @_sage_socket?
            winston.debug("sage_session.restart: killing old process")
            misc_node.process_kill(@_sage_socket.pid, 0)
            delete @_sage_socket
        winston.debug("sage_session.restart: getting new socket")
        @sage_socket (err) =>
            if err
                winston.debug("sage_session.restart: got it but err -- #{err}")
                client_socket.write_mesg('json', message.error(id:mesg.id, error:err))
            else
                winston.debug("sage_session.restart: got it success")
                client_socket.write_mesg('json', message.success(id:mesg.id))

    sage_update: (opts={}) =>
        opts = defaults opts,
            kill : false    # if true, remove all running flags and all this_session flags
            auto : false    # if true, run all cells that have the auto flag set
        if not @content?  # document not initialized
            return
        # Here we:
        #    - scan the string @content for execution requests.
        #    - also, if we see a cell UUID that we've seen already, we randomly generate
        #      a new cell UUID; clients can annoyingly generate non-unique UUID's (e.g., via
        #      cut and paste) so we fix that.
        winston.debug("sage_update")#: opts=#{misc.to_json(opts)}")
        i = 0
        prev_ids = {}
        z = 0
        while true
            z += 1
            if z > 5000
                winston.debug("sage_update: ERROR -- hit a possible infinite loop; opts=#{misc.to_json(opts)}")
                break
            i = @content.indexOf(diffsync.MARKERS.cell, i)
            if i == -1
                break
            j = @content.indexOf(diffsync.MARKERS.cell, i+1)
            if j == -1
                break  # corrupt and is the last one, so not a problem.
            id  = @content.slice(i+1,i+37)
            if misc.is_valid_uuid_string(id)

                # if id isn't valid -- due to document corruption or a bug, just skip it rather than get into all kinds of trouble.
                # TODO: repair.

                if prev_ids[id]?
                    # oops, repeated "unique" id, so fix it.
                    id = uuid.v4()
                    @content = @content.slice(0,i+1) + id + @content.slice(i+37)
                    # Also, if 'r' in the flags for this cell, remove it since it
                    # can't possibly be already running (given the repeat).
                    flags = @content.slice(i+37, j)
                    if diffsync.FLAGS.running in flags
                        new_flags = ''
                        for t in flags
                            if t != diffsync.FLAGS.running
                                new_flags += t
                        @content = @content.slice(0,i+37) + new_flags + @content.slice(j)

                prev_ids[id] = true
                flags = @content.slice(i+37, j)
                if opts.kill or opts.auto
                    if opts.kill
                        # worksheet process just killed, so clear certain flags.
                        new_flags = ''
                        for t in flags
                            if t != diffsync.FLAGS.running and t != diffsync.FLAGS.this_session
                                new_flags += t
                        #winston.debug("sage_update: kill=true, so changing flags from '#{flags}' to '#{new_flags}'")
                        if flags != new_flags
                            @content = @content.slice(0,i+37) + new_flags + @content.slice(j)
                    if opts.auto and diffsync.FLAGS.auto in flags
                        # worksheet process being restarted, so run auto cells
                        @sage_remove_cell_flag(id, diffsync.FLAGS.auto)
                        @sage_execute_cell(id)
                else if diffsync.FLAGS.execute in flags
                    # normal execute
                    @sage_execute_cell(id)

            # set i to next position after end of line that contained flag we just considered;
            # above code may have added flags to this line (but won't have added anything before this line).
            i = @content.indexOf('\n',j + 1)
            if i == -1
                break

    sage_output_mesg: (output_id, mesg) =>
        cell_id = @_sage_output_to_input_id[output_id]
        #winston.debug("output_id=#{output_id}; cell_id=#{cell_id}; map=#{misc.to_json(@_sage_output_to_input_id)}")

        if mesg.hide?
            # Hide a single component (also, do not record the message itself in the
            # document, just its impact).
            flag = undefined
            if mesg.hide == 'input'
                flag = diffsync.FLAGS.hide_input
            else if mesg.hide == 'output'
                flag = diffsync.FLAGS.hide_output
            if flag?
                @sage_set_cell_flag(cell_id, flag)
            else
                winston.debug("invalid hide component: '#{mesg.hide}'")
            delete mesg.hide

        if mesg.show?
            # Show a single component of cell.
            flag = undefined
            if mesg.show == 'input'
                flag = diffsync.FLAGS.hide_input
            else if mesg.show == 'output'
                flag = diffsync.FLAGS.hide_output
            if flag?
                @sage_remove_cell_flag(cell_id, flag)
            else
                winston.debug("invalid hide component: '#{mesg.hide}'")
            delete mesg.show

        if mesg.auto?
            # set or unset whether or not cell is automatically executed on startup of worksheet
            if mesg.auto
                @sage_set_cell_flag(cell_id, diffsync.FLAGS.auto)
            else
                @sage_remove_cell_flag(cell_id, diffsync.FLAGS.auto)

        if mesg.done? and mesg.done and cell_id?
            @sage_remove_cell_flag(cell_id, diffsync.FLAGS.running)
            delete @_sage_output_to_input_id[output_id]
            delete mesg.done # not needed
            if /^\s\s*/.test(mesg.stdout)   # final whitespace not needed for proper display
                delete mesg.stdout
            if /^\s\s*/.test(mesg.stderr)
                delete mesg.stderr

        if misc.is_empty_object(mesg)
            return

        if mesg.once? and mesg.once
            # only javascript is define  once=True
            if mesg.javascript?
                msg = message.execute_javascript
                    session_uuid : @session_uuid
                    code         : mesg.javascript.code
                    coffeescript : mesg.javascript.coffeescript
                    obj          : mesg.obj
                    cell_id      : cell_id
                bcast = message.codemirror_bcast
                    session_uuid : @session_uuid
                    mesg         : msg
                @client_bcast(undefined, bcast)
                return  # once = do *not* want to record this message in the output stream.

        i = @content.indexOf(diffsync.MARKERS.output + output_id)
        if i == -1
            # no such output cell anymore -- ignore (?) -- or we could make such a cell...?
            winston.debug("WORKSHEET: no such output cell (ignoring) -- #{output_id}")
            return
        n = @content.indexOf('\n', i)
        if n == -1
            winston.debug("WORKSHEET: output cell corrupted (ignoring) -- #{output_id}")
            return

        if mesg.clear?
            # delete all output server side
            k = i + (diffsync.MARKERS.output + output_id).length + 1
            @content = @content.slice(0, k) + @content.slice(n)
            return

        if mesg.delete_last?
            k = @content.lastIndexOf(diffsync.MARKERS.output, n-2)
            @content = @content.slice(0, k+1) + @content.slice(n)
            return

        @content = @content.slice(0,n) + JSON.stringify(mesg) + diffsync.MARKERS.output + @content.slice(n)

    sage_find_cell_meta: (id, start) =>
        i = @content.indexOf(diffsync.MARKERS.cell + id, start)
        j = @content.indexOf(diffsync.MARKERS.cell, i+1)
        if j == -1
            return undefined
        return {start:i, end:j}

    sage_get_cell_flagstring: (id) =>
        pos = @sage_find_cell_meta(id)
        return @content.slice(pos.start+37, pos.end)

    sage_set_cell_flagstring: (id, flags) =>
        pos = @sage_find_cell_meta(id)
        if pos?
            @content = @content.slice(0, pos.start+37) + flags + @content.slice(pos.end)

    sage_set_cell_flag: (id, flag) =>
        s = @sage_get_cell_flagstring(id)
        if flag not in s
            @sage_set_cell_flagstring(id, flag + s)

    sage_remove_cell_flag: (id, flag) =>
        s = @sage_get_cell_flagstring(id)
        if flag in s
            s = s.replace(new RegExp(flag, "g"), "")
            @sage_set_cell_flagstring(id, s)

    sage_initialize_cell_for_execute: (id, start) =>   # start is optional, but can speed finding cell
        # Initialize the line of the document for output for the cell with given id.
        # We do this by finding where that cell starts, then searching for the start
        # of the next cell, deleting any output lines in between, and placing one new line
        # for output.  This function returns
        #   - output_id: a newly created id that identifies the new output line.
        #   - code: the string of code that will be executed by Sage.
        # Or, it returns undefined if there is no cell with this id.
        cell_start = @content.indexOf(diffsync.MARKERS.cell + id, start)
        if cell_start == -1
            # there is now no cell with this id.
            return

        code_start = @content.indexOf(diffsync.MARKERS.cell, cell_start+1)
        if code_start == -1
            # TODO: cell is mangled: would need to fix...?
            return

        newline = @content.indexOf('\n', cell_start)  # next newline after cell_start
        next_cell = @content.indexOf(diffsync.MARKERS.cell, code_start+1)
        if newline == -1
            # At end of document: append a newline to end of document; this is where the output will go.
            # This is a very common special case; it's what we would get typing "2+2[shift-enter]"
            # into a blank worksheet.
            output_start = @content.length # position where the output will start
            # Put some extra newlines in, since it is hard to put input at the bottom of the screen.
            @content += '\n\n\n\n\n'
            winston.debug("Add a new input cell at the very end (which will be after the output).")
        else
            while true
                next_cell_start = @content.indexOf(diffsync.MARKERS.cell, newline)
                if next_cell_start == -1
                    # This is the last cell, so we end the cell after the last line with no whitespace.
                    next_cell_start = @content.search(/\s+$/)
                    if next_cell_start == -1
                        next_cell_start = @content.length+1
                        @content += '\n\n\n\n\n'
                    else
                        while next_cell_start < @content.length and @content[next_cell_start]!='\n'
                            next_cell_start += 1
                        if @content[next_cell_start]!='\n'
                            @content += '\n\n\n\n\n'
                        next_cell_start += 1
                output = @content.indexOf(diffsync.MARKERS.output, newline)
                if output == -1 or output > next_cell_start
                    # no more output lines to delete
                    output_start = next_cell_start  # this is where the output line will start
                    break
                else
                    # delete the line of output we just found
                    output_end = @content.indexOf('\n', output+1)
                    @content = @content.slice(0, output) + @content.slice(output_end+1)
        code = @content.slice(code_start+1, output_start)
        output_id = uuid.v4()
        if output_start > 0 and @content[output_start-1] != '\n'
            output_insert = '\n'
        else
            output_insert = ''
        output_insert += diffsync.MARKERS.output + output_id + diffsync.MARKERS.output + '\n'
        if next_cell == -1
            # There is no next cell.
            output_insert += diffsync.MARKERS.cell + uuid.v4() + diffsync.MARKERS.cell + '\n'
        @content = @content.slice(0, output_start) + output_insert + @content.slice(output_start)
        return {code:code.trim(), output_id:output_id}


    ##############################

    kill: () =>
        # Put any cleanup here...
        winston.debug("Killing session #{@session_uuid}")
        @sync_filesystem () =>
            @diffsync_fileserver.kill()
            # TODO: Are any of these deletes needed?  I don't know.
            delete @content
            delete @diffsync_fileclient
            delete @diffsync_fileserver
        if @_sage_socket?
            # send FIN packet so that Sage process may terminate naturally
            @_sage_socket.end()
            # ... then, brutally kill it if need be (a few seconds later). :-)
            if @_sage_socket.pid?
                setTimeout( (() => misc_node.process_kill(@_sage_socket.pid, 9)), 3000 )

    set_content: (value) =>
        @is_active = true
        changed = false
        if @content != value
            @content = value
            changed = true

        if @diffsync_fileclient.live != value
            @diffsync_fileclient.live = value
            changed = true
        for id, ds_client of @diffsync_clients
            if ds_client.live != value
                changed = true
                ds_client.live = value
        return changed

    client_bcast: (socket, mesg) =>
        @is_active = true
        winston.debug("client_bcast: #{json(mesg)}")

        # Forward this message on to all global hubs except the
        # one that just sent it to us...
        client_id = mesg.client_id
        for id, ds_client of @diffsync_clients
            if client_id != id
                mesg.client_id = id
                #winston.debug("BROADCAST: sending message from hub with socket.id=#{socket?.id} to hub with socket.id = #{id}")
                ds_client.remote.socket.write_mesg('json', mesg)

    client_diffsync: (socket, mesg) =>
        @is_active = true

        write_mesg = (event, obj) ->
            if not obj?
                obj = {}
            obj.id = mesg.id
            socket.write_mesg 'json', message[event](obj)

        # Message from some client reporting new edits, thus initiating a sync.
        ds_client = @diffsync_clients[mesg.client_id]

        if not ds_client?
            write_mesg('error', {error:"client #{mesg.client_id} not registered for synchronization"})
            return

        if @_client_sync_lock # or Math.random() <= .5 # (for testing)
            winston.debug("client_diffsync hit a click_sync_lock -- send retry message back")
            write_mesg('error', {error:"retry"})
            return

        if @_filesystem_sync_lock
            if @_filesystem_sync_lock < new Date()
                @_filesystem_sync_lock = false
            else
                winston.debug("client_diffsync hit a filesystem_sync_lock -- send retry message back")
                write_mesg('error', {error:"retry"})
                return

        @_client_sync_lock = true
        before = @content
        ds_client.recv_edits mesg.edit_stack, mesg.last_version_ack, (err) =>  # TODO: why is this err ignored?
            @set_content(ds_client.live)
            @_client_sync_lock = false
            @process_new_content?()
            # Send back our own edits to the global hub.
            ds_client.remote.current_mesg_id = mesg.id  # used to tag the return message
            ds_client.push_edits (err) =>
                if err
                    winston.debug("CodeMirrorSession -- client push_edits returned -- #{err}")
                else
                    changed = (before != @content)
                    if changed
                        # We also suggest to other clients to update their state.
                        @tell_clients_to_update(mesg.client_id)
                        @update_revision_tracking()

    tell_clients_to_update: (exclude) =>
        for id, ds_client of @diffsync_clients
            if exclude != id
                ds_client.remote.sync_ready()

    sync_filesystem: (cb) =>
        @is_active = true

        if @_client_sync_lock # or Math.random() <= .5 # (for testing)
            winston.debug("sync_filesystem -- hit client sync lock")
            cb?("cannot sync with filesystem while syncing with clients")
            return
        if @_filesystem_sync_lock
            if @_filesystem_sync_lock < new Date()
                @_filesystem_sync_lock = false
            else
                winston.debug("sync_filesystem -- hit filesystem sync lock")
                cb?("cannot sync with filesystem; already syncing")
                return

        before = @content
        if not @diffsync_fileclient?
            cb?("filesystem sync object (@diffsync_fileclient) no longer defined")
            return

        @_filesystem_sync_lock = misc.expire_time(10)  # lock expires in 10 seconds no matter what -- uncaught exception could require this
        @diffsync_fileclient.sync (err) =>
            if err
                # Example error: 'reset -- checksum mismatch (29089 != 28959)'
                winston.debug("@diffsync_fileclient.sync -- returned an error -- #{err}")
                @diffsync_fileserver.kill() # stop autosaving and watching files
                # Completely recreate diffsync file connection and try to sync once more.
                @diffsync_fileserver = new DiffSyncFile_server @, (err, ignore_content) =>
                    if err
                        winston.debug("@diffsync_fileclient.sync -- making new server failed: #{err}")
                        @_filesystem_sync_lock = false
                        cb?(err); return
                    @diffsync_fileclient = new DiffSyncFile_client(@diffsync_fileserver)
                    @diffsync_fileclient.live = @content
                    @diffsync_fileclient.sync (err) =>
                        if err
                            winston.debug("@diffsync_fileclient.sync -- making server worked but re-sync failed -- #{err}")
                            @_filesystem_sync_lock = false
                            cb?("codemirror fileclient sync error -- '#{err}'")
                        else
                            @_filesystem_sync_lock = false
                            cb?()
                return

            if @diffsync_fileclient.live != @content
                @set_content(@diffsync_fileclient.live)
                # recommend all clients sync
                for id, ds_client of @diffsync_clients
                    ds_client.remote.sync_ready()
            @_filesystem_sync_lock = false
            cb?()

    add_client: (socket, client_id) =>
        @is_active = true
        ds_client = new diffsync.DiffSync(doc:@content)
        ds_client.connect(new CodeMirrorDiffSyncHub(socket, @session_uuid, client_id))
        @diffsync_clients[client_id] = ds_client

        winston.debug("CodeMirrorSession(#{@path}).add_client(client_id=#{client_id}) -- now we have #{misc.len(@diffsync_clients)} clients.")

        # Ensure we do not broadcast to a hub if it has already disconnected.
        socket.on 'end', () =>
            winston.debug("DISCONNECT: socket connection #{socket.id} from global hub disconected.")
            delete @diffsync_clients[client_id]

    remove_client: (socket, client_id) =>
        delete @diffsync_clients[client_id]

    write_to_disk: (socket, mesg) =>
        @is_active = true
        winston.debug("write_to_disk: #{json(mesg)} -- calling sync_filesystem")
        @sync_filesystem (err) =>
            if err
                resp = message.error(id:mesg.id, error:"Error writing file '#{@path}' to disk -- #{err}")
            else
                resp = message.codemirror_wrote_to_disk(id:mesg.id, hash:misc.hash_string(@content))
            socket.write_mesg('json', resp)

    read_from_disk: (socket, mesg) =>
        async.series([
            (cb) =>
                fs.stat (err, stats) =>
                    if err
                        cb(err)
                    else
                        cb(common.check_file_size(stats.size))
            (cb) =>
                fs.readFile @path, (err, data) =>
                    if err
                        cb("Error reading file '#{@path}' from disk -- #{err}")
                    else
                        value = data.toString()
                        if value != @content
                            @set_content(value)
                            # Tell the global hubs that now might be a good time to do a sync.
                            for id, ds of @diffsync_clients
                                ds.remote.sync_ready()
                        cb()

        ], (err) =>
            if err
                socket.write_mesg('json', message.error(id:mesg.id, error:err))
            else
                socket.write_mesg('json', message.success(id:mesg.id))
        )

    get_content: (socket, mesg) =>
        @is_active = true
        socket.write_mesg('json', message.codemirror_content(id:mesg.id, content:@content))

    # enable or disable tracking all revisions of the document
    revision_tracking: (socket, mesg) =>
        winston.debug("revision_tracking for #{@path}: #{mesg.enable}")
        d = (m) -> winston.debug("revision_tracking for #{@path}: #{m}")
        if mesg.enable
            d("enable it")
            if @revision_tracking_doc?
                d("already enabled")
                # already enabled
                socket.write_mesg('json', message.success(id:mesg.id))
            else
                if @readonly
                    # nothing to do -- silently don't enable (is this a good choice?)
                    socket.write_mesg('json', message.success(id:mesg.id))
                    return
                # need to enable
                d("need to enable")
                file_sessions().connect
                    mesg :
                        path       : revision_tracking_path(@path)
                    cb   : (err, session) =>
                        d("got response -- #{err}")
                        if err
                            socket.write_mesg('json', message.error(id:mesg.id, error:err))
                        else
                            @revision_tracking_doc = session
                            socket.write_mesg('json', message.success(id:mesg.id))
                            @update_revision_tracking()
        else
            d("disable it")
            delete @revision_tracking_doc
            socket.write_mesg('json', message.success(id:mesg.id))

    # If we are tracking the revision history of this file, add a new entry in that history.
    # TODO: add user responsibile for this change as input to this function and as
    # a field in the entry object below.   NOTE: Be sure to include "changing the file on disk"
    # as one of the users, which is *NOT* defined by an account_id.
    update_revision_tracking: () =>
        if not @revision_tracking_doc?
            return
        winston.debug("update revision tracking data - #{@path}")

        # @revision_tracking_doc.HEAD is the last version of the document we're tracking, as a string.
        # In particular, it is NOT in JSON format.

        if not @revision_tracking_doc.HEAD?

            # Initialize HEAD from the file

            if @revision_tracking_doc.content.length == 0
                # brand new -- first time.
                @revision_tracking_doc.HEAD = @content
                @revision_tracking_doc.content = misc.to_json(@content)
            else
                # we have tracked this file before.
                i = @revision_tracking_doc.content.indexOf('\n')
                if i == -1
                    # weird special case: there's no history yet -- just the initial version
                    @revision_tracking_doc.HEAD = misc.from_json(@revision_tracking_doc.content)
                else
                    # there is a potential longer history; this initial version is the first line:
                    @revision_tracking_doc.HEAD = misc.from_json(@revision_tracking_doc.content.slice(0,i))

        if @revision_tracking_doc.HEAD != @content
            # compute diff that transforms @revision_tracking_doc.HEAD to @content
            patch = diffsync.dmp.patch_make(@content, @revision_tracking_doc.HEAD)
            @revision_tracking_doc.HEAD = @content

            # replace the file by new version that has first line equal to JSON version of HEAD,
            # and rest all the patches, with our one new patch inserted at the front.
            # TODO: redo without doing a split for efficiency.
            i = @revision_tracking_doc.content.indexOf('\n')
            entry = {patch:diffsync.compress_patch(patch), time:new Date() - 0}
            @revision_tracking_doc.content = misc.to_json(@content) + '\n' + \
                        misc.to_json(entry) + \
                        (if i != -1 then @revision_tracking_doc.content.slice(i) else "")

        # now tell everybody
        @revision_tracking_doc._set_content_and_sync()

        # save the revision tracking file to disk (but not too frequently)
        if not @revision_tracking_save_timer?
            f = () =>
                delete @revision_tracking_save_timer
                @revision_tracking_doc.sync_filesystem()
            @revision_tracking_save_timer = setInterval(f, REVISION_TRACKING_SAVE_INTERVAL_S*1000)

# Collection of all CodeMirror sessions hosted by this local_hub.

class CodeMirrorSessions
    constructor: () ->
        @_sessions = {by_uuid:{}, by_path:{}, by_project:{}}

    dbg: (f) =>
        return (m) -> winston.debug("CodeMirrorSessions.#{f}: #{m}")

    connect: (opts) =>
        opts = defaults opts,
            client_socket : undefined
            mesg          : required    # event of type codemirror_get_session
            cb            : undefined   # cb?(err, session)
        dbg = @dbg("connect")
        mesg = opts.mesg
        dbg(misc.to_json(mesg))
        finish = (session) ->
            if not opts.client_socket?
                return
            session.add_client(opts.client_socket, mesg.client_id)
            opts.client_socket.write_mesg 'json', message.codemirror_session
                id           : mesg.id,
                session_uuid : session.session_uuid
                path         : session.path
                content      : session.content
                readonly     : session.readonly

        if mesg.session_uuid?
            dbg("getting session using session_uuid")
            session = @_sessions.by_uuid[mesg.session_uuid]
            if session?
                finish(session)
                opts.cb?(undefined, session)
                return

        if mesg.path?
            dbg("getting session using path")
            session = @_sessions.by_path[mesg.path]
            if session?
                finish(session)
                opts.cb?(undefined, session)
                return

        mesg.session_uuid = uuid.v4()
        new CodeMirrorSession mesg, (err, session) =>
            if err
                opts.client_socket?.write_mesg('json', message.error(id:mesg.id, error:err))
                opts.cb?(err)
            else
                @add_session_to_cache
                    session    : session
                    project_id : mesg.project_id
                    timeout    : 3600   # time in seconds (or undefined to not use timer)
                finish(session)
                opts.cb?(undefined, session)

    add_session_to_cache: (opts) =>
        opts = defaults opts,
            session    : required
            project_id : undefined
            timeout    : undefined   # or a time in seconds
        winston.debug("Adding session #{opts.session.session_uuid} (of project #{opts.project_id}) to cache.")
        @_sessions.by_uuid[opts.session.session_uuid] = opts.session
        @_sessions.by_path[opts.session.path] = opts.session
        if opts.project_id?
            if not @_sessions.by_project[opts.project_id]?
                @_sessions.by_project[opts.project_id] = {}
            @_sessions.by_project[opts.project_id][opts.session.path] = opts.session

        destroy = () =>
            opts.session.kill()
            delete @_sessions.by_uuid[opts.session.session_uuid]
            delete @_sessions.by_path[opts.session.path]
            x =  @_sessions.by_project[opts.project_id]
            if x?
                delete x[opts.session.path]

        if opts.timeout?
            destroy_if_inactive = () =>
                if not (opts.session.is_active? and opts.session.is_active)
                    winston.debug("Session #{opts.session.session_uuid} is inactive for #{opts.timeout} seconds; killing.")
                    destroy()
                else
                    opts.session.is_active = false  # it must be changed by the session before the next timer.
                    # We use setTimeout instead of setInterval, because we want to *ensure* that the
                    # checks are spaced out over at *least* opts.timeout time.
                    winston.debug("Starting a new activity check timer for session #{opts.session.session_uuid}.")
                    setTimeout(destroy_if_inactive, opts.timeout*1000)

            setTimeout(destroy_if_inactive, opts.timeout*1000)

    # Return object that describes status of CodeMirror sessions for a given project
    info: (project_id) =>
        obj = {}
        X = @_sessions.by_project[project_id]
        if X?
            for path, session of X
                obj[session.session_uuid] = {path : session.path}
        return obj

    handle_mesg: (client_socket, mesg) =>
        dbg = @dbg('handle_mesg')
        dbg("#{json(mesg)}")
        if mesg.event == 'codemirror_get_session'
            @connect
                client_socket : client_socket
                mesg          : mesg
            return

        # all other message types identify the session only by the uuid.
        session = @_sessions.by_uuid[mesg.session_uuid]
        if not session?
            winston.debug("codemirror.handle_mesg -- Unknown CodeMirror session: #{mesg.session_uuid}.")
            client_socket.write_mesg('json', message.error(id:mesg.id, error:"Unknown CodeMirror session: #{mesg.session_uuid}."))
            return
        switch mesg.event
            when 'codemirror_diffsync'
                session.client_diffsync(client_socket, mesg)
            when 'codemirror_bcast'
                session.client_bcast(client_socket, mesg)
            when 'codemirror_write_to_disk'
                session.write_to_disk(client_socket, mesg)
            when 'codemirror_read_from_disk'
                session.read_from_disk(client_socket, mesg)
            when 'codemirror_get_content'
                session.get_content(client_socket, mesg)
            when 'codemirror_revision_tracking'  # enable/disable revision_tracking
                session.revision_tracking(client_socket, mesg)
            when 'codemirror_execute_code'
                session.sage_execute_code(client_socket, mesg)
            when 'codemirror_introspect'
                session.sage_introspect(client_socket, mesg)
            when 'codemirror_send_signal'
                session.send_signal_to_sage_session(client_socket, mesg)
            when 'codemirror_restart'
                session.restart(client_socket, mesg)
            when 'codemirror_disconnect'
                session.remove_client(client_socket, mesg.client_id)
                client_socket.write_mesg('json', message.success(id:mesg.id))
            when 'codemirror_sage_raw_input'
                session.sage_raw_input(client_socket, mesg)
            else
                client_socket.write_mesg('json', message.error(id:mesg.id, error:"unknown CodeMirror session event: #{mesg.event}."))

_file_sessions = undefined
exports.file_sessions = file_sessions = ->
    _file_sessions ?= new CodeMirrorSessions()
    return _file_sessions
