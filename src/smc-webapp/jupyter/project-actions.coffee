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

{OutputHandler} = require('./output-handler')
{IpynbImporter} = require('./import-from-ipynb')

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

        @_load_from_disk_if_newer () =>
            @set_backend_state('init')

            @ensure_backend_kernel_setup()  # this may change the syncdb.

            @init_kernel_info()             # need to have for saving.

            @init_file_watcher()

            @syncdb.on 'save_to_disk_project', (err) =>
                if not err
                    @save_ipynb_file()

            @_state = 'ready'
            @ensure_there_is_a_cell()
            if not @store.get('kernel')?
                @set_kernel(DEFAULT_KERNEL)
                @ensure_backend_kernel_setup()
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
        dbg = @dbg("ensure_backend_kernel_setup")
        kernel = @store.get('kernel')
        if not kernel?
            dbg("no kernel")
            return

        current = @_jupyter_kernel?.name

        dbg("kernel='#{kernel}', current='#{current}'")

        if current == kernel
            # everything is properly setup
            return

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

        # Ready to run code, etc.
        @sync_exec_state()
        @set_backend_state('ready')

    init_kernel_info: =>
        if not @store.get('kernels')?
            @_jupyter_kernel?.get_kernel_data (err, kernels) =>
                if not err
                    @setState(kernels: immutable.fromJS(kernels.jupyter_kernels))

    # _manage_cell_change is called after a cell change has been
    # incorporated into the store by _syncdb_cell_change.
    # It should do things like ensure any cell with a compute request
    # gets computed, that all positions are unique, that there is a
    # cell, etc.  Only one client will run this code.
    manage_on_cell_change: (id, new_cell, old_cell) =>
        dbg = @dbg("manage_on_cell_change(id='#{id}')")
        dbg("new_cell='#{misc.to_json(new_cell?.toJS())}',old_cell='#{misc.to_json(old_cell?.toJS())}')")

        if not new_cell?
            # TODO: delete cell -- if it was running, stop it.
            return

        if new_cell.get('state') == 'start' and old_cell?.get('state') != 'start'
            @manager_run_cell(id)
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

    # Runs only on the backend
    manager_run_cell: (id) =>
        dbg = @dbg("manager_run_cell(id='#{id}')")
        dbg()

        delete @_run_again?[id]  # if @_run_again[id] is set on completion of eval, then cell is run again; this is used only when re-running a cell currently running.

        @ensure_backend_kernel_setup()

        if not @_jupyter_kernel?
            handler.error("Unable to start Jupyter")
            return

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

        handler.on 'change', (save) =>
            @syncdb.set(cell, save)

        handler.once 'done', =>
            delete @_running_cells?[id]
            if @_run_again?[id]
                @run_code_cell(id)

        handler.on 'more_output', (mesg, mesg_length) =>
            @set_more_output(id, mesg, mesg_length)

        handler.on('process', @_jupyter_kernel.process_output)

        @_jupyter_kernel.execute_code
            code : input
            id   : id
            cb   : (err, mesg) =>
                dbg("got mesg='#{JSON.stringify(mesg)}'")
                if err
                    dbg("got error='#{err}'")
                    handler.error(err)
                    return
                if mesg.msg_type == 'clear_output'
                    handler.clear(mesg.content.wait)
                    return
                if mesg.content.execution_state == 'idle'
                    handler.done()
                    return
                if mesg.content.execution_state == 'busy'
                    handler.start()
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

            # check if there is a text field, which we can truncate
            if not did_truncate and output.messages[0].data?
                for field, val of output.messages[0].data
                    if field.slice(0,4) == 'text'
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
                    dbg("err stat'ing file: #{err}")
                    # TODO
                else if not last_changed? or stats.ctime > last_changed
                    dbg("disk file changed more recently than edits, so loading")
                    @load_ipynb_file()
                else
                    dbg("stick with database version")
                cb?(err)

    load_ipynb_file: =>
        dbg = @dbg("load_ipynb_file")
        dbg("reading file")
        @_client.path_read
            path       : @store.get('path')
            maxsize_MB : 10   # TODO: increase -- will eventually be able to handle a pretty big file!
            cb         : (err, content) =>
                if err
                    # TODO: need way to report this to frontend
                    dbg("error reading file: #{err}")
                    return
                try
                    content = JSON.parse(content)
                catch err
                    dbg("error parsing ipynb file: #{err}")
                    return
                @set_to_ipynb(content)

    save_ipynb_file: =>
        dbg = @dbg("save_ipynb_file")
        dbg('saving to file')
        if not @_jupyter_kernel?
            dbg('no kernel so cannot save')
            return
        dbg("going to try to save")
        ipynb = @store.get_ipynb(@_jupyter_kernel.get_blob_store())
        data = JSON.stringify(ipynb, null, 2)
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

    set_to_ipynb0: (ipynb) =>
        dbg = @dbg("set_to_ipynb")
        @_state = 'load'

        # We have to parse out the kernel so we can use process_output below.
        # (TODO: rewrite so process_output is not associated with a specific kernel)
        kernel = ipynb.metadata?.kernelspec?.name ? DEFAULT_KERNEL
        dbg("kernel in ipynb: name='#{kernel}'")
        @syncdb.set({type: 'settings', kernel: kernel}, false)
        @ensure_backend_kernel_setup()

        importer = new IpynbImporter()
        importer.on('process', @_jupyter_kernel.process_output)

        @syncdb.delete(false)
        for record in importer.import(ipynb)
            @syncdb.set(record, false)

        @syncdb.sync () =>
            @ensure_backend_kernel_setup()
            @_state = 'ready'

    # Given an ipynb JSON object, set the syncdb (and hence the store, etc.) to
    # the notebook defined by that object.
    set_to_ipynb: (ipynb) =>
        dbg = @dbg("set_to_ipynb")
        @_state = 'load'
        if not ipynb?
            dbg("undefined ipynb so make blank")
            @syncdb.delete()
            @_state = 'ready'
            @ensure_there_is_a_cell()  # just in case the ipynb file had no cells (?)
            return

        #dbg("importing '#{JSON.stringify(ipynb)}'")
        @syncdb.exit_undo_mode()

        # We re-use any existing ids to make the patch that defines changing
        # to the contents of ipynb more efficient.   In case of a very slight change
        # on disk, this can be massively more efficient.
        existing_ids = @store.get('cell_list')?.toJS() ? []

        # delete everything
        @syncdb.delete(undefined, false)

        set = (obj) =>
            @syncdb.set(obj, false)

        # Set the kernel and other settings
        kernel = ipynb.metadata?.kernelspec?.name ? DEFAULT_KERNEL
        dbg("kernel in ipynb: name='#{kernel}'")
        set(type: 'settings', kernel: kernel)
        @ensure_backend_kernel_setup()

        if ipynb.nbformat <= 3
            dbg("handle older kernel format")
            ipynb.cells ?= []
            for worksheet in ipynb.worksheets
                for cell in worksheet.cells
                    if cell.input?
                        cell.source = cell.input
                        delete cell.input
                    if cell.cell_type == 'heading'
                        cell.cell_type = 'markdown'
                        if misc.is_array(cell.source)
                            cell.source = cell.source.join('')
                        cell.source = '# ' + "#{cell.source}"
                    ipynb.cells.push(cell)

        dbg("Read in the cells")
        if ipynb.cells?
            n = 0
            for cell in ipynb.cells
                if cell.source?
                    # "If you intend to work with notebook files directly, you must allow multi-line
                    # string fields to be either a string or list of strings."
                    # https://nbformat.readthedocs.io/en/latest/format_description.html#top-level-structure
                    if misc.is_array(cell.source)
                        input = cell.source.join('')
                    else
                        input = cell.source
                if cell.execution_count?
                    exec_count = cell.execution_count
                else if cell.prompt_number?
                    exec_count = cell.prompt_number
                else
                    exec_count = null

                cell_type = cell.cell_type ? 'code'

                types = ['image/svg+xml', 'image/png', 'image/jpeg', 'text/html', 'text/markdown', 'text/plain', 'text/latex']
                if cell.outputs?.length > 0
                    output = {}
                    for k, content of cell.outputs  # it's fine that k is a string here.
                        if ipynb.nbformat <= 3
                            # fix old deprecated fields
                            if content.output_type == 'stream'
                                if misc.is_array(content.text)
                                    content.text = content.text.join('')
                                content.name = content.stream
                            else
                                for t in types
                                    [a,b] = t.split('/')
                                    if content[b]?
                                        content = {data:{"#{t}": content[b]}}
                                        break  # at most one data per message.
                                if content.text?
                                    content = {data:{'text/plain':content.text}, output_type:'stream'}

                        if content.data?
                            for key, val of content.data
                                if misc.is_array(val)
                                    content.data[key] = val.join('')

                        delete content.prompt_number  # in some files
                        @_jupyter_kernel.process_output(content)
                        output[k] = content
                else
                    output = null

                obj =
                    type       : 'cell'
                    id         : existing_ids[n] ? @_new_id()
                    pos        : n
                    input      : input
                    output     : output
                    cell_type  : cell_type
                    exec_count : exec_count
                if cell.metadata.collapsed
                    obj.collapsed = cell.metadata.collapsed
                if cell.metadata.scrolled
                    obj.scrolled = cell.metadata.scrolled
                set(obj)

                n += 1

        @syncdb.sync () =>
            @set_kernel(kernel)
            @ensure_backend_kernel_setup()

            # Wait for the store to get fully updated in response to the sync.
            @_state = 'ready'
            if not ipynb.cells? or ipynb.cells.length == 0
                @ensure_there_is_a_cell()  # the ipynb file had no cells (?)

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