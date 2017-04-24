###
manager-actions: additional actions that are only available in the
backend/project, which "manages" everything.

This code should not *explicitly* require anything that is only
available in the project or requires node to run, so that we can
fully unit test it via mocking of components.

###

immutable      = require('immutable')
underscore     = require('underscore')

misc           = require('smc-util/misc')
actions        = require('./actions')

json_stable    = require('json-stable-stringify')

{OutputHandler} = require('./output-handler')

DEFAULT_KERNEL = 'python2'  #TODO

class exports.JupyterActions extends actions.JupyterActions

    set_backend_state: (state) =>
        ###
        The backend states, which are put in the syncdb so clients
        can display this:

         - 'init' -- the backend is checking the file on disk, etc.
         - 'ready' -- the backend is setup and ready to use; kernel isn't running though
         - 'starting' -- the kernel itself is actived and currently starting up (e.g., Sage is starting up)
         - 'running' -- the kernel is running and ready to evaluate code


         'init' --> 'ready'  --> 'spawning' --> 'starting' --> 'running'
                     /|\                                        |
                      |-----------------------------------------|

        Going from ready to starting happens when a code execution is requested.
        ###
        if state not in ['init', 'ready', 'spawning', 'starting', 'running']
            throw Error("invalid backend state '#{state}'")
        @_backend_state = state
        @_set
            type          : 'settings'
            backend_state : state

    set_kernel_state: (state, save=false) =>
        @_kernel_state = state
        @_set({type:'settings', kernel_state: state}, save)

    # Called exactly once when the manager first starts up after the store is initialized.
    # Here we ensure everything is in a consistent state so that we can react
    # to changes later.
    initialize_manager: =>
        if @_initialize_manager_already_done
            return
        @_initialize_manager_already_done = true

        dbg = @dbg("initialize_manager")
        dbg("cells at manage_init = #{JSON.stringify(@store.get('cells')?.toJS())}")

        @sync_exec_state = underscore.debounce(@sync_exec_state, 2000)

        # WARNING: @_load_from_disk_if_newer must happen before anything that might touch
        # the syncdb state.  Otherwise, the syncdb state will automatically be
        # newer than what is on disk, and we'll never load anything from disk.

        #dbg("syncdb='#{JSON.stringify(@syncdb.get().toJS())}'")

        @setState  # used by jupyter.coffee
            start_time : @_client.server_time() - 0

        # We try once to load from disk.  If it fails, then a record with type:'fatal'
        # is created in the database; if it succeeds, that record is deleted.
        # Try again only when the file changes.
        @_first_load()

    _first_load: =>
        dbg = @dbg("_first_load")
        dbg("doing load")
        @_load_from_disk_if_newer (err) =>
            if not err
                dbg("loading worked")
                @_init_after_first_load()
            else
                dbg("load failed -- #{err}; wait for one change and try again")
                watcher = @_client.watch_file
                    path     : @store.get('path')
                    interval : 3000
                watcher.once 'change', =>
                    dbg("file changed")
                    watcher.close()
                    @_first_load()

    _init_after_first_load: =>
        dbg = @dbg("_init_after_first_load")

        dbg("initializing")
        @set_backend_state('init')

        @ensure_backend_kernel_setup()  # this may change the syncdb.

        @init_file_watcher()

        @syncdb.on 'save_to_disk_project', (err) =>
            if not err
                @save_ipynb_file()

        @_state = 'ready'
        @ensure_there_is_a_cell()
        if not @store.get('kernel')?
            @set_kernel(DEFAULT_KERNEL)
            @ensure_backend_kernel_setup()

        @init_kernel_info()   # need to have for saving; must be after setting kernel.

        @set_backend_state('ready')

        @syncdb.on('change', @_backend_syncdb_change)

    _backend_syncdb_change: (changes) =>
        changes?.forEach (key) =>
            if key.get('type') != 'settings'
                return
            #@dbg("_backend_syncdb_change")("#{JSON.stringify(@syncdb.get({type:'settings'}).toJS())}")
            record = @syncdb.get_one(key)
            if record?
                # ensure kernel is properly configured
                @ensure_backend_kernel_setup()
                # only the backend should change kernel and backend state;
                # however, our security model allows otherwise (e.g., via TimeTravel).
                if record.get('kernel_state') != @_kernel_state
                    @set_kernel_state(@_kernel_state, true)
                if record.get('backend_state') != @_backend_state
                    @set_backend_state(@_backend_state)
            return
        @ensure_there_is_a_cell()
        @sync_exec_state()

    # ensure_backend_kernel_setup ensures that we have a connection
    # to the proper type of kernel.
    ensure_backend_kernel_setup: =>
        kernel = @store.get('kernel')
        if not kernel?
            return

        current = @_jupyter_kernel?.name
        if current == kernel
            # everything is properly setup
            return

        dbg = @dbg("ensure_backend_kernel_setup")
        dbg("kernel='#{kernel}', current='#{current}'")

        if current? and current != kernel
            dbg("kernel changed")
            # kernel changed -- close it; this will trigger 'close' event, which
            # runs code below that deletes attribute and creates new kernel wrapper.
            @_jupyter_kernel?.close()
            return

        if @_jupyter_kernel?
            throw Error("this case should be impossible")

        dbg("no kernel; make one")
        # No kernel wrapper object setup at all. Make one.
        @_jupyter_kernel = @_client.jupyter_kernel
            name    : kernel
            path    : @store.get('path')
            actions : @

        # Since we just made a new kernel connection, clearly no cells are running on the backend.
        delete @_running_cells

        # When the kernel closes, we will forget about it, then
        # make sure a new kernel gets setup.
        @_jupyter_kernel.once 'close', =>
            # kernel closed -- clean up then make new one.
            delete @_jupyter_kernel
            @ensure_backend_kernel_setup()

        # Track backend state changes.
        @_jupyter_kernel.on 'state', (state) =>
            switch state
                when 'spawning', 'starting', 'running'
                    @set_backend_state(state)
                when 'closed'
                    delete @_jupyter_kernel
                    @set_backend_state('init')
                    @ensure_backend_kernel_setup()

        @_jupyter_kernel.on('execution_state', @set_kernel_state)

        @_jupyter_kernel.on 'spawn_error', (err) =>
            # TODO: need to save so gets reported to frontend...
            dbg("error: #{err}")

        # Ready to run code, etc.
        @sync_exec_state()
        @set_backend_state('ready')

    init_kernel_info: =>
        dbg = @dbg("init_kernel_info")
        dbg("kernels.size=#{@store.get('kernels')?.size}")
        if not @store.get('kernels')?
            dbg('getting')
            if not @_jupyter_kernel?
                @ensure_backend_kernel_setup()
            if not @_jupyter_kernel?
                dbg("no kernel, so unable to get info")
                return
            @_jupyter_kernel?.get_kernel_data (err, kernels) =>
                dbg("got #{err}, #{misc.to_json(kernels)}")
                if not err
                    @setState(kernels: immutable.fromJS(kernels.jupyter_kernels))

    # _manage_cell_change is called after a cell change has been
    # incorporated into the store by _syncdb_cell_change.
    # It should do things like ensure any cell with a compute request
    # gets computed, that all positions are unique, that there is a
    # cell, etc.  Only one client will run this code.
    manager_on_cell_change: (id, new_cell, old_cell) =>
        dbg = @dbg("manager_on_cell_change(id='#{id}')")
        dbg("new_cell='#{misc.to_json(new_cell?.toJS())}',old_cell='#{misc.to_json(old_cell?.toJS())}')")

        if not new_cell?
            # TODO: delete cell -- if it was running, stop it.
            return

        if new_cell.get('state') == 'start' and old_cell?.get('state') != 'start'
            @manager_run_cell_enqueue(id)
            return

    # Ensure that the cells listed as running *are* exactly the
    # ones actually running or queued up to run.
    sync_exec_state: =>
        change = false
        # First verify that all actual cells that are said to be running
        # (according to the store) are in fact running.
        @store.get('cells').forEach (cell, id) =>
            state = cell.get('state')
            if state? and state != 'done' and not @_running_cells?[id]
                @_set({type:'cell', id:id, state:'done'}, false)
                change = true
            return
        if @_running_cells?
            cells = @store.get('cells')
            # Next verify that every cell actually running is still in the document
            # and listed as running.  TimeTravel, deleting cells, etc., can
            # certainly lead to this being necessary.
            for id of @_running_cells
                state = cells.get(id)?.get('state')
                if not state? or state == 'done'
                    # cell no longer exists or isn't in a running state
                    @_cancel_run(id)
        if change
            @_sync()

    _cancel_run: (id) =>
        if @_running_cells?[id]
            @_jupyter_kernel?.cancel_execute(id: id)

    # Note that there is a request to run a given cell.
    # You must call manager_run_cell_process_queue for them to actually start running.
    manager_run_cell_enqueue: (id) =>
        if @_running_cells?[id]
            return
        @_manager_run_cell_queue ?= {}
        @_manager_run_cell_queue[id] = true

    # properly start running -- in order -- the cells that have been requested to run
    manager_run_cell_process_queue: =>
        if not @_manager_run_cell_queue?
            return
        v = (@store.getIn(['cells', id]) for id, _ of @_manager_run_cell_queue when not @_running_cells?[id])
        v.sort (a,b) ->
            misc.cmp(a?.get('start'), b?.get('start'))
        # dbg = @dbg("manager_run_cell_process_queue")
        # dbg("running: #{misc.to_json( ([a?.get('start'), a?.get('id')] for a in v) )}")
        for cell in v
            if cell?
                @manager_run_cell(cell.get('id'))
        delete @_manager_run_cell_queue

    manager_run_cell: (id) =>
        dbg = @dbg("manager_run_cell(id='#{id}')")
        dbg()

        delete @_run_again?[id]  # if @_run_again[id] is set on completion of eval, then cell is run again; this is used only when re-running a cell currently running.

        @ensure_backend_kernel_setup()

        cell   = @store.get('cells').get(id)
        input  = (cell.get('input') ? '').trim()

        @_running_cells ?= {}

        if @_running_cells[id]
            # The cell is already running, so we must ensure cell is
            # not already running; this would happen if your run cell,
            # change input while it is still running, then re-run.
            @_run_again ?= {}
            @_run_again[id] = true
            @_cancel_run(id)
            return

        @_running_cells[id] = true
        @reset_more_output(id)

        cell =
            id     : id
            type   : 'cell'
            kernel : @store.get('kernel')

        dbg("using max_output_length=#{@store.get('max_output_length')}")
        handler = new OutputHandler
            cell              : cell
            max_output_length : @store.get('max_output_length')
            report_started_ms : 250
            dbg               : (m) -> dbg(".handler #{m}")

        handler.on 'change', (save) =>
            @syncdb.set(cell, save)

        handler.once 'done', =>
            delete @_running_cells?[id]
            if @_run_again?[id]
                @run_code_cell(id)

        handler.on 'more_output', (mesg, mesg_length) =>
            @set_more_output(id, mesg, mesg_length)

        if not @_jupyter_kernel?
            handler.error("Unable to start Jupyter")
            return

        handler.on('process', @_jupyter_kernel.process_output)

        get_password = =>
            password = @_jupyter_kernel.store.get(id)
            @_jupyter_kernel.store.delete(id)
            return password

        # This is used only for stdin right now.
        cell_change = (cell_id, new_cell) =>
            if id == cell_id
                dbg("cell_change")
                handler.cell_changed(new_cell, get_password)
        @store.on('cell_change', cell_change)

        @_jupyter_kernel.execute_code
            code  : input
            id    : id
            stdin : handler.stdin
            cb    : (err, mesg) =>
                dbg("got mesg='#{JSON.stringify(mesg)}'")
                if err
                    dbg("got error='#{err}'")
                    handler.error(err)
                    return
                if mesg.msg_type == 'clear_output'
                    handler.clear(mesg.content.wait)
                    return
                if mesg.content.execution_state == 'idle'
                    @store.removeListener('cell_change', cell_change)
                    return
                if mesg.content.execution_state == 'busy'
                    handler.start()
                if mesg.content.payload?
                    if mesg.content.payload?.length > 0
                        # payload shell message:
                        # Despite https://ipython.org/ipython-doc/3/development/messaging.html#payloads saying
                        # ""Payloads are considered deprecated, though their replacement is not yet implemented."
                        # we fully have to implement them, since they are used to implement (crazy, IMHO)
                        # things like %load in the python2 kernel!
                        for p in mesg.content.payload
                            handler.payload(p)
                    handler.done()
                else
                    # Normal iopub output message
                    handler.message(mesg.content)

    reset_more_output: (id) =>
        if @store._more_output?[id]?
            delete @store._more_output[id]

    set_more_output: (id, mesg, length) =>
        @store._more_output ?= {}
        output = @store._more_output[id] ?= {length:0, messages:[], lengths:[], discarded:0, truncated:0}

        output.length += length
        output.lengths.push(length)
        output.messages.push(mesg)

        goal_length = 10*@store.get('max_output_length')
        while output.length > goal_length
            did_truncate = false

            # check if there is a text field, which we can truncate
            len = output.messages[0].text?.length
            if len?
                need = output.length - goal_length + 50
                if len > need
                    # Instead of throwing this message away, let's truncate its text part.  After
                    # doing this, the message is at least need shorter than it was before.
                    output.messages[0].text = misc.trunc(output.messages[0].text, len - need)
                    did_truncate = true

            # check if there is a text/plain field, which we can thus also safely truncate
            if not did_truncate and output.messages[0].data?
                for field, val of output.messages[0].data
                    if field == 'text/plain'
                        len = val.length
                        if len?
                            need = output.length - goal_length + 50
                            if len > need
                                # Instead of throwing this message away, let's truncate its text part.  After
                                # doing this, the message is at least need shorter than it was before.
                                output.messages[0].data[field] = misc.trunc(val, len - need)
                                did_truncate = true

            if did_truncate
                new_len = JSON.stringify(output.messages[0]).length
                output.length -= output.lengths[0] - new_len  # how much we saved
                output.lengths[0] = new_len
                output.truncated += 1
                break

            n = output.lengths.shift()
            output.messages.shift()
            output.length -= n
            output.discarded += 1

    init_file_watcher: =>
        dbg = @dbg("file_watcher")
        dbg()
        @_file_watcher = @_client.watch_file
            path     : @store.get('path')
            interval : 3000

        @_file_watcher.on 'change', =>
            dbg("change")
            if new Date() - @_last_save_ipynb_file <= 10000
                # Guard against reacting to saving file to disk, which would
                # be inefficient and could lead to corruption.
                return
            @load_ipynb_file()

        @_file_watcher.on 'delete', =>
            dbg('delete')

    _load_from_disk_if_newer: (cb) =>
        dbg = @dbg("load_from_disk_if_newer")
        last_changed = @syncdb.last_changed()
        dbg("syncdb last_changed=#{last_changed}")
        @_client.path_stat
            path : @store.get('path')
            cb   : (err, stats) =>
                dbg("stats.ctime = #{stats?.ctime}")
                if err
                    # this just means the file doesn't exist.
                    cb?()
                else if not last_changed? or stats.ctime > last_changed
                    dbg("disk file changed more recently than edits, so loading")
                    @load_ipynb_file(cb)
                else
                    dbg("stick with database version")
                    cb?(err)

    load_ipynb_file: (cb) =>
        dbg = @dbg("load_ipynb_file")
        dbg("reading file")
        path = @store.get('path')
        @_client.path_read
            path       : path
            maxsize_MB : 10
            cb         : (err, content) =>
                if err
                    error = "Error reading ipynb file '#{path}': #{err}.  You must restore access to this ipynb file somehow before continuing."
                    @syncdb.set(type:'fatal', error:error)
                    cb?(error)
                    return
                try
                    content = JSON.parse(content)
                    @syncdb.delete(type:'fatal')
                catch err
                    error = "Error parsing the ipynb file '#{path}': #{err}.  You must fix the ipynb file somehow before continuing."
                    dbg(error)
                    @syncdb.set(type:'fatal', error:error)
                    cb?(error)
                    return
                @set_to_ipynb(content)
                cb?()

    save_ipynb_file: =>
        dbg = @dbg("save_ipynb_file")
        dbg('saving to file')
        if not @_jupyter_kernel?
            dbg('no kernel so cannot save')
            return
        if not @store.get('kernels')?
            dbg("kernel info not known, so can't save")
            return
        dbg("going to try to save")
        ipynb = @store.get_ipynb(@_jupyter_kernel.get_blob_store())
        # We use json_stable (and indent 1) to be more diff friendly to user, and more consistent
        # with official Jupyter.
        data = json_stable(ipynb,{space:1})
        if not data?
            dbg("ipynb not defined yet; can't save")
            return
        #dbg("got string version '#{data}'")
        @_client.write_file
            path : @store.get('path')
            data : data
            cb   : (err) =>
                if err
                    # TODO: need way to report this to frontend
                    dbg("error writing file: #{err}")
                    return
                else
                    dbg("succeeded at saving")
                    @_last_save_ipynb_file = new Date()

    ensure_there_is_a_cell: =>
        if @_state != 'ready'
            return
        cells = @store.get('cells')
        if not cells? or cells.size == 0
            @_set
                type  : 'cell'
                id    : @_new_id()
                pos   : 0
                input : ''