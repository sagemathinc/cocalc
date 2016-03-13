###
SageMathCloud: A collaborative web-based interface to Sage, Python, LaTeX and the Terminal.

    Copyright (C) 2014, 2015, 2016, William Stein

Jupyter Notebook Synchronization

There are multiple representations of the notebook.

   - @doc      = syncstring version of the notebook (uses SMC sync functionality)
   - @nb       = the visible view stored in the browser DOM
   - @filename = the .ipynb file on disk

In addition, every other browser opened viewing the notebook has it's own @doc and @nb, and
there is a single upstream copy of @doc in the local_hub daemon.

The user edits @nb.  Periodically we check to see if any changes were made (@nb.dirty) and
if so, we copy the state of @nb to @doc's live.

When @doc changes do to some other user changing something, we compute a diff that tranforms
the live notebook from its current state to the state that matches the new version of @doc.
See the function set_nb below.  Incidentally, I came up with this approach from scratch after
trying a lot of ideas, though in hindsite it's exactly the same as what React.js does (though
I didn't know about React.js at the time).
###

{EventEmitter}       = require('events')

async                = require('async')
stringify            = require('json-stable-stringify')
misc                 = require('smc-util/misc')
{defaults, required} = misc
{dmp}                = require('smc-util/syncstring')
{salvus_client}      = require('./salvus_client')
{redux}              = require('./smc-react')
syncdoc              = require('./syncdoc')
{synchronized_db}    = require('./syncdb')
sha1                 = require('sha1')
misc_page            = require('./misc_page')

templates            = $(".smc-jupyter-templates")
editor_templates     = $("#salvus-editor-templates")

exports.IPYTHON_SYNCFILE_EXTENSION = IPYTHON_SYNCFILE_EXTENSION = ".jupyter-sync"

###
Attempt a more generic well defined approach to sync

- Make an object with this API:

    - set
    - set_cursors
    - get
    - event:
       - 'ready'
       - 'error'
       - 'change'
       - 'cursor' - cursor info
       - 'info'   - user requests info (clicking on jupyter logo)
       - 'save'   - user requests save

States:

  - 'loading'
  - 'ready'
  - 'error'
  - 'closed'

The states of the editor :

  - 'init'   : started initializing
  - 'loading': is loading initial page
  - 'ready'  : page loaded and working
  - 'error'  : tried to load but failed
  - 'closed' : all resources freed

            [failed]  --> [closed]
               /|\           /|\
                |             |
               \|/            |
 [init] --> [loading] --> [ready]


Then something that takes in an object with the above API, and makes it sync.

Idea of how things work.  We view the Jupyter notebook as a block box that
lives in the DOM, which will tell us when it changes, and from which we can
get a JSON-able object representation, and we can set it from such a
representation efficiently without breaking cursors.  Jupyter does *NOT* provide
that functionality, so we implement something like that (you can think of
our approach as "inspired by React.js", but I just came up with it out of
pain and necessity in 2013 long before I heard of React.js).

Here's what happens:

First, assume that the syncstring and the DOM are equal.
There are two event-driven cases in which we handle
that the DOM and syncstring are out of sync.  After each
case, which is handled synchronously, the syncstring and
DOM are equal again.

Case 1: DOM change
 - we set the syncstring equal to the DOM.
 ==> now the syncstring equals the DOM, and syncstring is valid

Case 2: syncstring change
 - if DOM changed since last case 1 or 2, compute patch that transforms
   DOM from last state we read from
   DOM to current DOM state, and apply that patch to current syncstring.
 - modify syncstring to ensure it defines a valid state of the editor.
 - set DOM equal to syncstring
 ==> now the syncstring equals the DOM, and the syncstring is valid

The reason for the asymmetry is that (1) Jupyter doesn't give us a way
to be notified the moment the DOM changes, (2) even if it did, doing
case 1 every keystroke would be inefficient, (3) under the hood
syncstring also does the same sort of merging process.

###

underscore = require('underscore')

class JupyterWrapper extends EventEmitter
    constructor: (@element, @server_url, @filename, @read_only, @project_id, cb) ->
        @blobs = {}
        @blobs_pending = {}
        @state = 'loading'
        @iframe_uuid = misc.uuid()
        @iframe = $("<iframe name=#{@iframe_uuid} id=#{@iframe_uuid}>")
            .attr('src', "#{@server_url}#{@filename}")
            .attr('frameborder', '0')
            .attr('scrolling', 'no')
        @element.html('').append(@iframe)
        # wait until connected -- iT is ***critical*** to wait until
        # the kernel is connected before doing anything else!
        start = new Date()
        max_time_ms = 30*1000 # try for up to 30s
        f = () =>
            @frame ?= window.frames[@iframe_uuid]
            if not @frame
                setTimeout(f, 250)
                return
            if new Date() - start >= max_time_ms
                @state = 'error'
                @error = 'timeout loading'
                @emit('error')
                cb(@error)
            else
                # NOTE: we can't use '@nb.events.one "notebook_loaded.Notebook"', since we can't attach
                # to that event until events loads, and by then we may have missed the one event.
                # Also, I've observed that @frame.IPython.notebook._fully_loaded does not imply the
                # kernels are connected.
                if @frame?.IPython?.notebook?.kernel?.is_connected() and @frame.IPython.notebook._fully_loaded
                    # kernel is connected; now patch the Jupyter notebook page (synchronous)
                    @nb = @frame.IPython.notebook
                    if not @read_only and not @nb.writable
                        # read_only set to false, but in fact file is read only according to jupyter
                        # server, so we switch to read_only being true.
                        @read_only = true
                    if @read_only
                        # read only -- kill any channels to backend to make evaluation impossible.
                        # Also, ignore any changes to the DOM (shouldn't happen)
                        @nb.kernel.stop_channels()
                        @set_all_cells_read_only()
                    else
                        # not read only -- check for changes to the dump periodically.
                        # It would be dramatically better if Jupyter had an event it would
                        # fire on all changes, but this is what we have.
                        @dirty_interval = setInterval(@check_dirty, 250)
                        @nb.events.on('spec_changed.Kernel', => @nb.dirty = true)
                        @init_cursor()
                    @monkey_patch_frame()
                    @disable_autosave()
                    @state = 'ready'
                    @emit('ready')
                    cb()
                else
                    # not yet connected, so try again shortly
                    setTimeout(f, 250)
        f()

    dbg: (f) =>
        return (m) -> salvus_client.dbg("JupyterWrapper.#{f}:")(misc.to_json(m))

    close: () =>
        if @state == 'closed'
            return
        if @dirty_interval?
            clearInterval(@dirty_interval)
            delete @dirty_interval
        @element.html('')
        @removeAllListeners()
        delete @blobs
        delete @blobs_pending
        @state = 'closed'

    # save notebook file from DOM to disk
    save: (cb) =>
        @nb.save_notebook(false).then(cb)

    disable_autosave: () =>
        # We have our own auto-save system
        @nb.set_autosave_interval(0)

    monkey_patch_frame: () =>
        misc_page.cm_define_diffApply_extension(@frame.CodeMirror)
        @monkey_patch_logo()
        if @read_only
            @monkey_patch_read_only()
        @monkey_patch_ui()

    monkey_patch_ui: () =>
        # Proper file rename with sync not supported yet (but will be -- TODO;
        # needs to work with sync system)
        @frame.$("#notebook_name").unbind('click').css("line-height",'0em')

        # Get rid of file menu, which weirdly and wrongly for sync replicates everything.
        for cmd in ['new', 'open', 'copy', 'rename']
            @frame.$("#" + cmd + "_notebook").hide()

        @frame.$("#save_checkpoint").hide()
        @frame.$("#restore_checkpoint").hide()
        @frame.$("#save-notbook").hide()   # in case they fix the typo
        @frame.$("#save-notebook").hide()  # in case they fix the typo

        @frame.$(".checkpoint_status").hide()
        @frame.$(".autosave_status").hide()

        @frame.$("#menus").find("li:first").find(".divider").hide()

        # This makes the ipython notebook take up the full horizontal width, which is more
        # consistent with the rest of SMC.   Also looks better on mobile.
        @frame.$('<style type=text/css></style>').html(".container{width:98%; margin-left: 0;}").appendTo(@frame.$("body"))

        if not require('./feature').IS_MOBILE
            @frame.$("#site").css("padding-left", "20px")

        if not @read_only
            $(@iframe[0].contentWindow.document).keydown (evt) =>
                if evt.ctrlKey or evt.metaKey or evt.altKey
                    if evt.keyCode == 83 # s
                        @emit('save')
                        evt.preventDefault()
                        evt.stopPropagation()
                        return false

    monkey_patch_logo: () =>
        @frame.$("#ipython_notebook").find("a").click () =>
            @emit('info')
            return false

    monkey_patch_read_only: () =>
        $(@frame.document).find("#menubar").hide()   # instead do this if want to preserve kernel -- find('.nav').hide()
        $(@frame.document).find("#maintoolbar").hide()
        $(@frame.document).find(".current_kernel_logo").hide()

    check_dirty: () =>
        if @nb.dirty and @nb.dirty != 'clean'
            # nb.dirty is used internally by IPython so we shouldn't change it's truthiness.
            # However, we still need a way in Sage to know that the notebook isn't dirty anymore.
            @nb.dirty = 'clean'
            @emit('change')

    set0: (obj) =>
        obj =
            content : obj
            name    : @nb.notebook_name
            path    : @nb.notebook_path
        @nb.fromJSON(obj)
        if @read_only
            @set_all_cells_read_only()

    set_all_cells_read_only: () =>
        for i in [0...@nb.ncells()]
            @nb.get_cell(i).code_mirror.setOption('readOnly',true)

    get0: () =>
        return @nb.toJSON()

    # Transform the visible displayed notebook view into what is described by the string doc.
    # If not read_only: returns string that actually got set, in case the doc string is
    # partly invalid and must be changed...
    # If read_only: what happens on set is not guaranteed to be at all correct
    # when document is read_only, e.g., then we do not change metadata, since Jupyter starts
    # spawning kernels, and we can't stop that.
    set: (doc) =>
        if @state != 'ready'
            throw Error("state must be ready")

        #dbg = @dbg("set")
        #dbg()
        if typeof(doc) != 'string'
            throw Error("BUG -- set: doc must be of type string")

        # What we want visible document to look like
        goal = doc.split('\n')

        # What the actual visible document looks like.  We assume that live is valid.
        live = @get().split('\n')

        # What we actually set document to (construct during this function)
        next = ''

        if not @read_only
            # Metadata -- only do if not read only
            try
                metadata = JSON.parse(goal[0])
                last_metadata = JSON.parse(live[0])
                if not underscore.isEqual(metadata?.kernelspec, last_metadata.kernelspec)
                    # validate and make the change
                    spec = metadata?.kernelspec
                    if spec? and typeof(spec.name) == 'string' and typeof(spec.language) == 'string' and typeof(spec.display_name) == 'string'
                        @nb.kernel_selector.set_kernel(spec)
                        next += goal[0]
                    else
                        next += live[0]
                else
                    next += live[0]
            catch err
                # Make not change to kernel metadata, and instead set next to be what is live in DOM.
                console.warn("Error parsing metadata line: '#{goal[0]}', #{err}")
                metadata = live[0]
                next += live[0]
                # In this case we ignore metadata entirely; it'll get fixed when @get()
                # returns current valid metadata below.


        # Cells are all lines after first
        v0             = live.slice(1)
        v1             = goal.slice(1)

        # Map cells to unique unicode characters
        string_mapping = new misc.StringCharMapping()
        v0_string      = string_mapping.to_string(v0)
        v1_string      = string_mapping.to_string(v1)

        #console.log("v0_string='#{v0_string}'")
        #console.log("v1_string='#{v1_string}'")

        # Compute how to transform current cell list into new one via sequence of
        # operations involving inserts and deletes (a diff).
        diff           = dmp.diff_main(v0_string, v1_string)

        #dbg(["diff", diff])
        index = 0
        i = 0
        while i < diff.length
            chunk = diff[i]
            op    = chunk[0]  # -1 = delete, 0 = leave unchanged, 1 = insert
            val   = chunk[1]
            if op == 0
                # skip over  cells
                index += val.length
            else if op == -1
                if i < diff.length - 1 and diff[i+1][0] == 1 and diff[i+1][1].length == val.length
                    # Replace Cell:  insert and delete
                    # A common special case arises when one is editing a single cell, which gets represented
                    # here as deleting then inserting.  Replacing is far more efficient than delete and add,
                    # due to the overhead of creating codemirror instances (presumably).  Also, we can
                    # maintain the user cursors and local-to-that-cell undo history.
                    for x in diff[i+1][1]
                        obj = undefined
                        try
                            obj = @line_to_cell(string_mapping._to_string[x])
                        catch err
                            console.warn("failed to parse '#{misc.trunc(string_mapping._to_string[x],300)}'. #{err}")
                        #old_val = stringify(@nb.get_cell(index).toJSON())  # for debugging only
                        if obj?
                            @mutate_cell(index, obj)
                        new_val = @cell_to_line(@nb.get_cell(index), false)
                        # Failure below expected in case of blobs:
                        #if new_val != string_mapping._to_string[x]
                        #    console.warn("setting failed -- \n'#{misc.trunc(string_mapping._to_string[x],300)}'\n'#{misc.trunc(new_val,300)}'")
                        #console.log("mutate: '#{old_val}' --> '#{new_val}'")
                        next  += '\n' + new_val
                        index += 1
                    i += 1 # skip over next chunk
                else
                    # Deleting cell
                    for j in [0...val.length]
                        @delete_cell(index)
            else if op == 1
                # Create new cells
                for x in val
                    obj = undefined
                    try
                        obj = @line_to_cell(string_mapping._to_string[x])
                    catch err
                        console.warn("failed to parse '#{string_mapping._to_string[x]}'. #{err}")
                    if obj?
                        @insert_cell(index, obj)
                        new_val = stringify(@nb.get_cell(index).toJSON())
                        # Failure below expected in case of blobs:
                        #if new_val != string_mapping._to_string[x]
                        #    console.warn("setting failed -- \n'#{misc.trunc(string_mapping._to_string[x],300)}'\n'#{misc.trunc(new_val,300)}'")
                        next  += '\n' + new_val
                        #console.log("insert: '#{new_val}'")
                        index += 1
            else
                console.warn("BUG -- invalid diff!", diff)
            i += 1

        if @read_only
            return
        # For now, we just re-get to guarantee that the result is definitely what is in the DOM.
        # This is not efficient; to would be better to algorithmically determine this based on
        # what happens above.  However, works for sure for now is better than "works in theory".
        res = @get()
        # Check below is commented out, since the result may be different since we now
        # factor blobs out.  Write a string with blobs, get something back without.
        #if doc != res
        #    console.log("tried to set to '#{doc}' but got '#{res}'")
        #    console.log("diff: #{misc.to_json(dmp.diff_main(doc, res))}")
        return res

    set_cell: (index, obj) =>
        dbg = @dbg("set_cell")
        dbg(index, obj)
        cell = @nb.get_cell(index)
        cm = cell.code_mirror
        cm_setValueNoJump(cm, obj.source) #
        # Add a new one then deleting existing -- correct order avoids flicker/jump
        new_cell = @nb.insert_cell_at_index(obj.cell_type, index)
        new_cell.fromJSON(obj)
        # Swap the codemirror, so we preserve cursors and local history.
        cell.code_mirror = new_cell.code_mirror
        new_cell.code_mirror = cm
        @nb.delete_cell(index + 1)
        # TODO: readonly

    init_cell_cursor: (cell, index) =>
        if @read_only or cell._smc_init_cell_cursor == index
            # cursor activity already initialized (or read_only so don't care)
            return
        if cell._smc_init_cell_cursor? and cell._smc_init_cell_cursor != index
            cell._smc_init_cell_cursor = index
            return
        cell.code_mirror?.on 'cursorActivity', (cm) =>
            if cm._setValueNoJump   # if true, this is being caused by external setValueNoJump
                return
            @emit('cursor', ({x:c.anchor.ch, y:c.anchor.line, i:cell._smc_init_cell_cursor} for c in cm.listSelections()))
        cell._smc_init_cell_cursor = index


    # Move the cursor with given color to the given pos.
    draw_other_cursors: (account_id, locs) =>
        # ensure @_cursors is defined; this is map from key to ...?
        #console.log("draw_other_cursors(#{account_id}, #{misc.to_json(locs)})")
        @_cursors ?= {}
        @_users   ?= smc.redux.getStore('users')  # todo -- obviously not like this...
        x = @_cursors[account_id]
        if not x?
            x = @_cursors[account_id] = []
        # First draw/update all current cursors
        for [i, loc] in misc.enumerate(locs)
            pos   = {line:loc.y, ch:loc.x}
            index = loc.i # cell index
            data  = x[i]
            name  = misc.trunc(@_users.get_first_name(account_id), 10)
            color = @_users.get_color(account_id)
            if not data?
                cursor = templates.find(".smc-jupyter-cursor").clone().show()
                cursor.css({'z-index':5})
                cursor.find(".smc-jupyter-cursor-label").css( top:'-1.8em', 'padding-left':'.5ex', 'padding-right':'.5ex', left:'.9ex', 'padding-top':'.3ex', position:'absolute')
                cursor.find(".smc-jupyter-cursor-inside").css(top:'-1.2em', left:'.9ex', position:'absolute')
                data = x[i] = {cursor: cursor}
            if name != data.name
                data.cursor.find(".smc-jupyter-cursor-label").text(name)
                data.name = name
            if color != data.color
                data.cursor.find(".smc-jupyter-cursor-inside").css('border-left': "1px solid #{color}")
                data.cursor.find(".smc-jupyter-cursor-label" ).css(background: color)
                data.color = color

            # Place cursor in the editor in the right spot
            #console.log("put cursor into cell #{index} at pos #{misc.to_json(pos)}", data.cursor)
            @nb.get_cell(index)?.code_mirror?.addWidget(pos, data.cursor[0], false)

            # Update cursor fade-out
            # LABEL: first fade the label out over 6s
            data.cursor.find(".smc-jupyter-cursor-label").stop().animate(opacity:1).show().fadeOut(duration:6000)
            # CURSOR: then fade the cursor out (a non-active cursor is a waste of space) over 20s.
            data.cursor.find(".smc-jupyter-cursor-inside").stop().animate(opacity:1).show().fadeOut(duration:20000)

        if x.length > locs.length
            # Next remove any cursors that are no longer there (e.g., user went from 5 cursors to 1)
            for i in [locs.length...x.length]
                #console.log('removing cursor ', i)
                x[i].cursor.remove()
            @_cursors[account_id] = x.slice(0, locs.length)

    init_cursor: () =>
        index = 0
        for cell in @nb.get_cells()
            @init_cell_cursor(cell, index)
            index += 1

    mutate_cell: (index, obj) =>
        #dbg = @dbg("mutate_cell")([index, obj])
        cell = @nb.get_cell(index)
        obj0 = cell.toJSON()
        if cell.cell_type != obj.cell_type
            switch obj.cell_type
                when 'markdown'
                    @nb.to_markdown(index)
                when 'code'
                    @nb.to_code(index)
                when 'raw'
                    @nb.to_raw(index)
                when 'heading'
                    @nb.to_heading(index)
        if cell.code_mirror? and obj0.source != obj.source
            # source differs
            cm_setValueNoJump(cell.code_mirror, obj.source)
            cell.auto_highlight()
        # TODO: when code running the asterisk doesn't sync out
        if cell.set_input_prompt? and obj0.execution_count != obj.execution_count
            cell.set_input_prompt(obj.execution_count ? '*')
        if cell.output_area? and (not underscore.isEqual(obj0.outputs, obj.outputs) or not underscore.isEqual(obj0.metadata, obj.metadata))
            cell.output_area.clear_output(false, true)
            cell.output_area.trusted = !!obj.metadata.trusted
            cell.output_area.fromJSON(obj.outputs ? [], obj.metadata)
        if cell.cell_type == 'markdown'
            cell.rendered = false
            cell.render()
        @init_cell_cursor(cell, index)

    delete_cell: (index) =>
        #@dbg("delete_cell")(index)
        @nb._unsafe_delete_cell(index)

    insert_cell: (index, obj) =>
        #@dbg("insert_cell")(index)
        new_cell = @nb.insert_cell_at_index(obj.cell_type, index)
        @mutate_cell(index, obj)
        if @read_only
            new_cell.code_mirror.setOption('readOnly',true)

    # Convert the visible displayed notebook into a textual sync-friendly string
    get: (to_db) =>
        doc = stringify(@nb.metadata)   # line 0 is metadata
        for cell in @nb.get_cells()
            doc += '\n' + @cell_to_line(cell, to_db)
        return doc

    show: (width) =>
        @iframe?.attr('width', width).maxheight()
        setTimeout((()=>@iframe?.maxheight()), 1)   # set it one time more in the next render loop.

    line_to_cell: (line) =>
        obj = JSON.parse(line)
        if obj.cell_type == 'code' and obj.outputs?
            for out in obj.outputs
                if out.data?
                    for k, v of out.data
                        if k.slice(0,4) == 'smc/'
                            blob = @load_blob(v)
                            if blob?
                                out.data[k.slice(4)] = blob
                                delete out.data[k]
        return obj

    cell_to_line: (cell, to_db) =>
        obj = cell.toJSON()
        if obj.cell_type == 'code' and obj.outputs?
            obj.outputs = misc.deep_copy(obj.outputs)
            for out in obj.outputs
                if out.data?
                    for k, v of out.data
                        if k.slice(0,6) == 'image/' and v
                            key = 'smc/' + k
                            if not out.data[key]?
                                out.data[key] = @save_blob(v, to_db)
                                delete out.data[k]
        return stringify(obj)

    save_blob: (blob, to_db) =>
        id = sha1(blob)
        if @blobs[id]
            return id
        @blobs[id] = blob
        if to_db
            query =
                blobs :
                    id         : id
                    blob       : blob
                    project_id : @project_id
            salvus_client.query
                query : query
                cb : (err, resp) =>
                    if err
                        console.warn("error saving: #{err}")
        return id

    load_blob: (id) =>
        blob = @blobs[id]
        if blob?
            return blob
        else
            # Async fetch blob from the database.
            @blobs_pending[id] = true
            salvus_client.query
                query :
                    blobs :
                        id   : id
                        blob : null
                cb: (err, resp) =>
                    if @state == 'closed'
                        return
                    delete @blobs_pending[id]
                    if err
                        console.warn("unable to get blob with id #{id}")
                    else
                        blob = resp.query?.blobs?.blob
                        if blob?
                            @blobs[id] = blob
                            @_update_cells_with_blob(id)
                        else
                            console.warn("no blob with id #{id}")
            return # blob not yet known

    _update_cells_with_blob: (id) =>
        # Find any cells with the given id in them and re-render them with
        # the blob properly substituted in.
        index = 0
        for cell in @nb.get_cells()
            outputs = cell.output_area?.outputs
            if outputs?
                done = false
                for out in outputs
                    if done
                        break
                    if out.data?
                        for k, v of out.data
                            if v == id
                                @mutate_cell(index, @line_to_cell(@cell_to_line(cell)))
                                done = true
                                break
            index += 1
        return



exports.jupyter_notebook = (editor, filename, opts) ->
    return (new JupyterNotebook(editor, filename, opts)).element

class JupyterNotebook extends EventEmitter
    constructor: (@editor, @filename, opts={}) ->
        opts = @opts = defaults opts,
            read_only : false
            mode      : undefined   # ignored
            cb        : undefined   # optional
        @read_only = opts.read_only
        @element = templates.find(".smc-jupyter-notebook").clone()
        @element.data("jupyter_notebook", @)
        @project_id = @editor.project_id

        @_other_cursor_timeout_s = 30  # only show active other cursors for this long

        # Jupyter is proxied via the following canonical URL:
        @server_url = "#{window.smc_base_url}/#{@editor.project_id}/port/jupyter/notebooks/"

        # special case/hack for developing SMC-in-SMC
        if window.smc_base_url.indexOf('/port/') != -1
            # Hack until we can figure out how to proxy websockets through a proxy
            # (things just get too complicated)...
            console.warn("Jupyter: assuming that SMC is being run from a project installed in the ~/smc directory!!")
            i = window.smc_base_url.lastIndexOf('/')
            @server_url = "#{window.smc_base_url.slice(0,i)}/jupyter/notebooks/smc/src/data/projects/#{@editor.project_id}/"

        s = misc.path_split(@filename)
        @path = s.head
        @file = s.tail

        # filename for our sync-friendly representation of the Jupyter notebook
        @syncdb_filename = (if @path then (@path+'/.') else '.') + @file + IPYTHON_SYNCFILE_EXTENSION

        # where we will put the page itself
        @notebook = @element.find(".smc-jupyter-notebook-notebook")

        # Load the notebook and transition state to either 'ready' or 'failed'
        @state = 'init'
        @load(opts.cb)

    dbg: (f) =>
        return (m) -> salvus_client.dbg("JupyterNotebook.#{f}:")(misc.to_json(m))

    destroy: () =>
        @close()

    close: () =>
        if @state == 'closed'
            return
        @removeAllListeners()
        @dom?.close()
        delete @dom
        @syncstring?.close()
        delete @syncstring
        @state = 'closed'

    load: (cb) =>
        if @state != 'init' and @state != 'failed'
            cb?("load BUG: @state must be init or failed")
            return

        @state = 'loading'
        async.parallel [@init_syncstring, @init_dom, @ipynb_timestamp], (err) =>
            @element.find(".smc-jupyter-startup-message").hide()
            @element.find(".smc-jupyter-notebook-buttons").show()
            if err
                @state = 'failed'
            else
                @init_dom_change()
                @init_syncstring_change()
                @init_dom_events()
                @init_buttons()
                @state = 'ready'
                if not @read_only and @syncstring.live() == ""
                    # First time to initialize the syncstring, so any images in the jupyter
                    # file definitely not saved to the blob store, so we pass true to save
                    # them all.
                    live = @dom.get(true)
                else
                    # Initialize local cache with all images in the document -- but don't send them to
                    # the backend blob store again, hence we pass false.
                    live = @dom.get(false)
                if not @read_only
                    # make either the syncstring or the file on disk the canonical one,
                    # depending on the time stamp.
                    if @syncstring_timestamp() > @_ipynb_load_timestamp
                        @dom.set(@syncstring.live())
                    else
                        @syncstring.live(live)
                        @syncstring.sync()
            @emit(@state)
            @show()
            cb?(err)

    init_syncstring: (cb) =>
        dbg = @dbg("init_syncstring")
        if @state != 'loading'
            dbg("illegal state")
            cb("init_syncfile BUG: @state must be loading")
            return
        if @read_only
            dbg("read only")
            cb()
            return
        dbg("initializing synchronized string '#{@syncdb_filename}'")
        syncdoc.synchronized_string
            project_id : @project_id
            filename   : @syncdb_filename
            cb         : (err, s) =>
                @syncstring = s
                cb(err)

    init_dom: (cb) =>
        if @state != 'loading'
            cb("init_dom BUG: @state must be loading")
            return
        done = (err) =>
            if err
                cb(err)
            else
                if @dom.read_only
                    # DOM gets extra info about @read_only status of file from jupyter notebook server.
                    @read_only = true
                else
                    # not read only, so make "command/control+s" save.
                    #@dom.frame.keydown (e) =>
                    #    console.log("frame keydown ", e)
                cb()
        @dom = new JupyterWrapper(@notebook, @server_url, @filename, @read_only, @project_id, done)

    init_buttons: () =>
        # info button
        @element.find("a[href=#info]").click(@info)

        # time travel/history
        @element.find("a[href=#history]").click(@show_history_viewer)

        # save button
        if @read_only
            @element.find("a[href=#save]").addClass('disabled')
        else
            @save_button = @element.find("a[href=#save]").click(@save)

        # publish button
        @publish_button = @element.find("a[href=#publish]").click(@publish_ui)

    init_dom_events: () =>
        @dom.on('info', @info)
        if not @read_only
            @dom.on 'cursor', (locs) =>
                @syncstring._syncstring.set_cursor_locs(locs)
            @syncstring._syncstring.on('cursor_activity', @render_cursor)
            @dom.on('save', @save)

    render_cursor: (account_id) =>
        if account_id == salvus_client.account_id
            return
        x = @syncstring._syncstring.get_cursors()?.get(account_id)
        # important: must use server time to compare, not local time.
        if salvus_client.server_time() - x?.get('time') <= @_other_cursor_timeout_s*1000
            locs = x.get('locs')?.toJS()
            if locs?
                @dom.draw_other_cursors(account_id, locs)

    # listen for and handle changes to the live document
    init_dom_change: () =>
        if @read_only
            # read-only mode: ignore any DOM changes
            return
        #dbg = @dbg("dom_change")
        @_last_dom = @dom.get()
        handle_dom_change = () =>
            #dbg()
            new_ver = @dom.get(true)  # true = save any newly created images to blob store.
            @_last_dom = new_ver
            @syncstring.live(new_ver)
            @syncstring.sync () =>
                @update_save_state()
        #@dom.on('change', handle_dom_change)
        # test this:
        # We debounce so that no matter what the live doc has to be still for a while before
        # we handle any changes to it.  Since handling changes can be VERY expensive for Jupyter,
        # do to our approach from the outside (not changing the Jupyter code itself), this avoids
        # slowing the user down.  Making the debounce value large is also useful for
        # testing edge cases of the sync algorithm.
        @dom.on('change', underscore.debounce(handle_dom_change, 1500))

    # listen for changes to the syncstring
    init_syncstring_change: () =>
        #dbg = @dbg("syncstring_change"); dbg()
        if @read_only
            return
        last_syncstring = @syncstring.live()
        handle_syncstring_change = () =>
            live = @syncstring.live()
            if last_syncstring != live
                # It really did change
                # Get current state of the DOM.  We do this even if not "dirty" -- we always get,
                # just to be absolutely sure, as this is critical to get right to avoid any data loss.
                cur_dom = @dom.get(true)
                if @_last_dom? and @_last_dom != cur_dom
                    # The DOM changed since the last time we saved, so we compute
                    # how it changed and apply that patch to the live syncstring
                    # that just came in.  The result is what we update the DOM
                    # to equal.
                    patch = dmp.patch_make(@_last_dom, cur_dom)
                    live = dmp.patch_apply(patch, live)[0]
                    @_last_dom = cur_dom
                    @syncstring.live(live)
                last_syncstring = live
                if cur_dom != live
                    # The actual current DOM is different than what we need to set it to be
                    # equal to, so... we mutate it to equal live.
                    @_last_dom = result = @dom.set(live)  # the output of this is what really got set.
                    if result != live
                        # It is entirely possible, due to weirdness of jupyter or corruption of the
                        # state of syncstring that setting doesn't result in a DOM that equals what
                        # we want.  We do NOT just change the syncstring, since that can lead to
                        # crazy feedback loops.  Instead, we just note this.  If the user actively
                        # does edit the DOM further, their change will then propogate back out.
                        # In particular, if the user then makes a change to this notebook, the fixed
                        # version of the syncstring will propogate automatically.  If
                        # they don't, it stays broken.  Having this notebook *fix*
                        # automatically DOES NOT WORK... because if there are multiple
                        # notebooks open at once, they will all fix at once, which
                        # breaks things (due to patch merge)!  Ad infinitum!!
                        console.warn("Jupyter sync: inconsistency during sync")

        # The throttle makes it so now matter how often the syncstring changes, with many
        # others doing edits (or whatever), we will only ever actually apply those changes
        # at most once every 2s.  We do fully apply all edits though.
        @syncstring.on('sync', underscore.throttle(handle_syncstring_change, 2000))
        @syncstring._syncstring.on('metadata-change', @update_save_state)

    ipynb_timestamp: (cb) =>
        #dbg = @dbg("ipynb_timestamp")
        #dbg("get when .ipynb file last *modified*")
        get_timestamp
            project_id : @project_id
            path       : @filename
            cb         : (err, timestamp) =>
                if not err
                    @_ipynb_load_timestamp = timestamp
                else
                    @_ipynb_load_timestamp = 0
                cb()

    syncstring_timestamp: () =>
        #dbg = @dbg("syncstring_timestamp")
        #dbg("get when .ipynb file last modified")
        if @state != 'ready'
            throw Error("BUG -- syncstring_timestamp -- state must be ready (but it is '#{@state}')")
        return @syncstring._syncstring.last_changed() - 0

    show: (geometry={}) =>
        @_last_top ?= @editor.editor_top_position()
        {top, left, width, height} = defaults geometry,
            left   : undefined  # not implemented
            top    : @_last_top
            width  : $(window).width()
            height : undefined  # not implemented
        @_last_top = top
        @element.css(top:top)
        if top == 0
            @element.css('position':'fixed')
        @dom.show(width)

    info: () =>
        t = "<h3><i class='fa fa-question-circle'></i> About <a href='https://jupyter.org/' target='_blank'>Jupyter Notebook</a></h3>"
        t += "<h4>Enhanced with SageMathCloud Sync</h4>"
        t += "You are editing this document using the Jupyter Notebook enhanced with realtime synchronization and history logging."
        t += "<h4>Use Sage by pasting this into a cell</h4>"
        t += "<pre>%load_ext sage</pre>"
        #t += "<h4>Connect to this Jupyter kernel in a terminal</h4>"
        #t += "<pre>ipython console --existing #{@kernel_id}</pre>"
        t += "<h4>Pure Jupyter notebooks</h4>"
        t += "You can <a target='_blank' href='#{@server_url}#{@filename}'>open this notebook in a vanilla Jupyter Notebook server without sync</a> (this link works only for project collaborators).  "
        #t += "<br><br>To start your own unmodified Jupyter Notebook server that is securely accessible to collaborators, type in a terminal <br><br><pre>ipython-notebook run</pre>"

        # this is still a problem, but removed to avoid overwhelming user.
        #t += "<h4>Known Issues</h4>"
        #t += "If two people edit the same <i>cell</i> simultaneously, the cursor will jump to the start of the cell."
        bootbox.alert(t)
        return false

    show_history_viewer: () =>
        path = misc.history_path(@filename)
        #@dbg("show_history_viewer")(path)
        @editor.project_page.open_file
            path       : path
            foreground : true

    update_save_state: () =>
        if not @save_button? or @state != 'ready'
            return
        if not @syncstring._syncstring.has_unsaved_changes()
            @save_button.addClass('disabled')
        else
            @save_button.removeClass('disabled')

    save: (cb) =>
        @save_button.icon_spin(start:true, delay:4000)
        async.parallel [@dom.save, @syncstring.save], (err) =>
            @save_button.icon_spin(false)
            @update_save_state()
            cb?(err)

    nbconvert: (opts) =>
        opts = defaults opts,
            format : required
            cb     : undefined
        salvus_client.exec
            path        : @path
            project_id  : @editor.project_id
            command     : 'sage'
            args        : ['-ipython', 'nbconvert', @file, "--to=#{opts.format}"]
            bash        : false
            err_on_exit : true
            timeout     : 30
            cb          : (err, output) =>
                #console.log("nbconvert finished with err='#{err}, output='#{misc.to_json(output)}'")
                opts.cb?(err)

    publish_ui: () =>
        url = document.URL
        url = url.slice(0,url.length-5) + 'html'
        dialog = templates.find(".smc-jupyter-publish-dialog").clone()
        dialog.modal('show')
        dialog.find(".btn-close").off('click').click () ->
            dialog.modal('hide')
            return false
        status = (mesg, percent) =>
            dialog.find(".smc-jupyter-publish-status").text(mesg)
            p = "#{percent}%"
            dialog.find(".progress-bar").css('width',p).text(p)

        @publish status, (err) =>
            dialog.find(".smc-jupyter-publish-dialog-publishing")
            if err
                dialog.find(".smc-jupyter-publish-dialog-fail").show().find('span').text(err)
            else
                dialog.find(".smc-jupyter-publish-dialog-success").show()
                url_box = dialog.find(".smc-jupyter-publish-url")
                url_box.val(url)
                url_box.click () ->
                    $(this).select()

    publish: (status, cb) =>
        @publish_button.find("fa-refresh").show()
        async.series([
            (cb) =>
                status?("saving",0)
                @save(cb)
            (cb) =>
                status?("running nbconvert",30)
                @nbconvert
                    format : 'html'
                    cb     : (err) =>
                        cb(err)
            (cb) =>
                status?("making '#{@filename}' public", 70)
                redux.getProjectActions(@editor.project_id).set_public_path(@filename, "Jupyter notebook #{@filename}")
                html = @filename.slice(0,@filename.length-5)+'html'
                status?("making '#{html}' public", 90)
                redux.getProjectActions(@editor.project_id).set_public_path(html, "Jupyter html version of #{@filename}")
                cb()
            ], (err) =>
            status?("done", 100)
            @publish_button.find("fa-refresh").hide()
            cb?(err)
        )

get_timestamp = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        cb         : required
    salvus_client.exec
        project_id : opts.project_id
        command    : "stat"   # %Z below = time of last change, seconds since Epoch; use this not %Y since often users put file in place, but with old time
        args       : ['--printf', '%Z ', opts.path]
        timeout    : 15
        err_on_exit: false
        cb         : (err, output) =>
            if err
                opts.cb(err)
            else if output.stderr.indexOf('such file or directory') != -1
                # file doesn't exist
                opts.cb(undefined, 0)
            else
                opts.cb(undefined, parseInt(output.stdout)*1000)

cm_setValueNoJump = (cm, value) ->
    cm._setValueNoJump = true  # so the cursor events that happen as a direct result of this setValue know.
    cm.diffApply(dmp.diff_main(cm.getValue(), value))
    delete cm._setValueNoJump

###
nbviewer -- used for publishing Jupyter notebooks
###

exports.jupyter_nbviewer = (editor, filename, content, opts) ->
    X = new JupyterNBViewer(editor, filename, content, opts)
    element = X.element
    element.data('jupyter_nbviewer', X)
    return element

class JupyterNBViewer
    constructor: (@editor, @filename, @content, opts) ->
        @element = templates.find(".smc-jupyter-nbviewer").clone()
        @ipynb_filename = @filename.slice(0,@filename.length-4) + 'ipynb'
        @ipynb_html_src = "/#{@editor.project_id}/raw/#{@filename}"
        @init_buttons()

    show: () =>
        if not @iframe?
            @iframe = @element.find(".smc-jupyter-nbviewer-content").find('iframe')
            # We do this, since otherwise just loading the iframe using
            #      @iframe.contents().find('html').html(@content)
            # messes up the parent html page, e.g., foo.modal() is gone.
            # setting the content this way, works in Chrome, but not FF
            #@iframe.contents().find('body').first().html(@content)
            # FIXME although really bad overhead, this is a quick fix for FF
            # callback, run after "load" event below this line
            @iframe.load ->
                @iframe.contents().find("body").on("click mousemove keydown focusin", smc.client.reset_idle)
            @iframe.attr('src', @ipynb_html_src)

        @element.css(top:@editor.editor_top_position())
        @element.maxheight(offset:18)
        @element.find(".smc-jupyter-nbviewer-content").maxheight(offset:18)
        @iframe.maxheight(offset:18)

    init_buttons: () =>
        @element.find('a[href=#copy]').click () =>
            @editor.project_page.display_tab('project-file-listing')
            actions = redux.getProjectActions(@editor.project_id)
            actions.set_all_files_unchecked()
            actions.set_file_checked(@ipynb_filename, true)
            actions.set_file_action('copy')
            return false

        @element.find('a[href=#download]').click () =>
            @editor.project_page.display_tab('project-file-listing')
            actions = redux.getProjectActions(@editor.project_id)
            actions.set_all_files_unchecked()
            actions.set_file_checked(@ipynb_filename, true)
            actions.set_file_action('download')
            return false
