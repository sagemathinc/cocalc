###
manager-actions: additional actions that are only available in the
backend/project, which "manages" everything.

This code should not *explicitly* require anything that is only
available in the project or requires node to run, so that we can
fully unit test it via mocking of components.

###

immutable      = require('immutable')

misc           = require('smc-util/misc')
actions        = require('./actions')

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
        @_set
            type          : 'settings'
            backend_state : state

    # Called exactly once when the manager first starts up after the store is initialized.
    # Here we ensure everything is in a consistent state so that we can react
    # to changes later.
    initialize_manager: =>
        if @_initialize_manager_already_done
            return
        @_initialize_manager_already_done = true

        dbg = @dbg("initialize_manager")
        dbg("cells at manage_init = #{JSON.stringify(@store.get('cells')?.toJS())}")

        @set_backend_state('init')

        # @_load_from_disk_if_newer must happen before anything that might touch
        # the syncdb state.  Otherwise, the syncdb state will automatically be
        # newer than what is on disk, and we'll never load anything from disk.

        @_load_from_disk_if_newer () =>
            @ensure_backend_kernel_setup()  # this sets the kernel identity, hence changes the syncdb.
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
            record = @syncdb.get_one(key)
            # ensure kernel is properly configured
            @ensure_backend_kernel_setup(record?.get('kernel'))
            return
        @ensure_there_is_a_cell()

    ensure_backend_kernel_setup: (kernel) =>
        dbg = @dbg("ensure_backend_kernel_setup")
        kernel ?= @store.get('kernel') ? 'python2'  # TODO...
        current = @_jupyter_kernel?.name

        dbg("kernel='#{kernel}'; current='#{current}'")

        if current == kernel
            # everything is properly setup
            return

        if current? and current != kernel
            dbg("kernel changed")
            # kernel changed -- close it; this will trigger 'close' event, which
            # runs code below that deletes attribute and creates new kernel wrapper.
            @_jupyter_kernel?.close()
            return

        if not @_jupyter_kernel?
            dbg("no kernel; make one")
            # No kernel wrapper object setup at all. Make one.
            @_jupyter_kernel = @_client.jupyter_kernel(name: kernel)

            @_jupyter_kernel.once 'close', =>
                # kernel closed -- clean up then make new one.
                delete @_jupyter_kernel
                @ensure_backend_kernel_setup()

            # Ready to run code, etc.
            @set_backend_state('ready')

            # Track backend state changes.
            @_jupyter_kernel.on 'state', (state) =>
                switch state
                    when 'spawning', 'starting', 'running'
                        @set_backend_state(state)
                    when 'closed'
                        delete @_jupyter_kernel
                        @set_backend_state('init')
                        @ensure_backend_kernel_setup()

            # Record info about our kernel.
            @_set
                type     : 'settings'
                identity : @_jupyter_kernel.get_identity()
                kernel   : kernel

    init_kernel_info: =>
        if not @store.get('kernels')?
            @_jupyter_kernel.get_kernel_data (err, kernels) =>
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

    # Runs only on the backend
    manager_run_cell: (id) =>
        dbg = @dbg("manager_run_cell(id='#{id}')")
        dbg()

        cell   = @store.get('cells').get(id)
        input  = (cell.get('input') ? '').trim()
        kernel = @store.get('kernel') ? 'python2'  # TODO...

        @ensure_backend_kernel_setup()

        # For efficiency reasons (involving syncdb patch sizes),
        # outputs is a map from the (string representations of) the numbers
        # from 0 to n-1, where there are n messages.
        outputs    = {}
        exec_count = null
        state      = 'run'
        n          = 0
        start      = null
        end        = null
        set_cell = =>
            dbg("set_cell: state='#{state}', outputs='#{misc.to_json(outputs)}', exec_count=#{exec_count}")
            @_set
                type       : 'cell'
                id         : id
                state      : state
                kernel     : kernel
                output     : outputs
                exec_count : exec_count
                start      : start
                end        : end
        report_started = =>
            if n > 0
                # do nothing -- already getting output
                return
            set_cell()
        setTimeout(report_started, 250)

        @_jupyter_kernel.execute_code
            code : input
            cb   : (err, mesg) =>
                dbg("got mesg='#{JSON.stringify(mesg)}'")
                if err
                    mesg = {error:err}
                    state = 'done'
                    end   = new Date() - 0
                    set_cell()
                else if mesg.content.execution_state == 'idle'
                    state = 'done'
                    end   = new Date() - 0
                    set_cell()
                else if mesg.content.execution_state == 'busy'
                    start = new Date() - 0
                    state = 'busy'
                    # If there was no output during the first few ms, we set the start to running
                    # and start reporting output.  We don't just do this immediately, since that's
                    # a waste of time, as very often the whole computation takes little time.
                    setTimeout(report_started, 250)
                if not err
                    if mesg.content.execution_count?
                        exec_count = mesg.content.execution_count
                    mesg.content = misc.copy_without(mesg.content, ['execution_state', 'code'])
                    for k, v of mesg.content
                        if misc.is_object(v) and misc.len(v) == 0
                            delete mesg.content[k]
                    if misc.len(mesg.metadata) > 0
                        mesg.content.metadata = mesg.metadata
                    if misc.len(mesg.buffers) > 0
                        mesg.content.buffers = mesg.buffers
                    k = misc.keys(mesg.content)
                    if k.length == 0 or (k.length == 1 and k[0] == 'execution_count')
                        # nothing interesting to send.
                        return
                    @_jupyter_kernel.process_output(mesg.content)
                outputs[n] = mesg.content
                n += 1
                set_cell()

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

    # Given an ipynb JSON object, set the syncdb (and hence the store, etc.) to
    # the notebook defined by that object.
    set_to_ipynb: (ipynb) =>
        @_state = 'load'
        if not ipynb?
            @syncdb.delete()
            @_state = 'ready'
            @ensure_there_is_a_cell()  # just in case the ipynb file had no cells (?)
            return

        @syncdb.exit_undo_mode()

        # We re-use any existing ids to make the patch that defines changing
        # to the contents of ipynb more efficient.   In case of a very slight change
        # on disk, this can be massively more efficient.
        existing_ids = @store.get('cell_list')?.toJS() ? []

        # delete everything
        @syncdb.delete(undefined, false)

        # Set the kernel and other settings
        kernel = ipynb.metadata?.kernelspec?.name ? DEFAULT_KERNEL  # TODO - need defaults
        @ensure_backend_kernel_setup(kernel)

        set = (obj) =>
            @syncdb.set(obj, false)

        if ipynb.nbformat <= 3
            # Handle older format.
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

        # Read in the cells
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