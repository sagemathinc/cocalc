##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014 -- 2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################
# Jupyter Notebook Synchronization
#
# There are multiple representations of the notebook.
#
#    - @doc      = syncstring version of the notebook (uses SMC sync functionality)
#    - @nb       = the visible view stored in the browser DOM
#    - @filename = the .ipynb file on disk
#
# In addition, every other browser opened viewing the notebook has it's own @doc and @nb, and
# there is a single upstream copy of @doc in the local_hub daemon.
#
# The user edits @nb.  Periodically we check to see if any changes were made (@nb.dirty) and
# if so, we copy the state of @nb to @doc's live.
#
# When @doc changes do to some other user changing something, we compute a diff that tranforms
# the live notebook from its current state to the state that matches the new version of @doc.
# See the function set_nb below.  Incidentally, I came up with this approach from scratch after
# trying a lot of ideas, though in hindsite it's exactly the same as what React.js does (though
# I didn't know about React.js at the time).
###############################################################################

# How long to try to download Jupyter notebook before giving up with an error.  Load times in excess of
# a minute can happen; this may be the SMC proxy being slow - not sure yet... but at least
# things should be allowed to work.
JUPYTER_LOAD_TIMEOUT_S = 60*10

$                    = window.$

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
misc_page            = require('./misc_page')

templates            = $(".smc-jupyter-templates")
editor_templates     = $("#salvus-editor-templates")

exports.IPYTHON_SYNCFILE_EXTENSION = IPYTHON_SYNCFILE_EXTENSION = ".sage-jupyter"

# Given a filename 'foo/bar/xyz.ipynb', return 'foo/bar/.xyz.ipynb.sage-jupyter'
exports.syncdb_filename = syncdb_filename = (ipynb_filename) ->
    misc.meta_file(ipynb_filename, 'jupyter')

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

Idea of how things work.  We view the Jupyter notebook as a black box that
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
    constructor: (@element, @server_url, @filename, @read_only, @project_id, timeout, cb) ->
        @blobs = {}
        @blobs_pending = {}
        @state = 'loading'
        @iframe_uuid = misc.uuid()
        @iframe = $("<iframe name=#{@iframe_uuid} id=#{@iframe_uuid} style='position:fixed'>")
            .attr('src', "#{@server_url}#{misc.encode_path(@filename)}")
            .attr('frameborder', '0')
            .attr('scrolling', 'no').hide()

        # Unlike a normal DOM element, iframes can't be moved in and out of the DOM or have parents
        # changed without refreshing like crazy.  Due to react and _wanting_ to do all sizing via CSS,
        # we hide/show the iframe at the end of the page, and position it fixed on top of the @element
        # whenever the @element resizes.
        $("body").append(@iframe)

        # wait until connected -- it is ***critical*** to wait until
        # the kernel is connected before doing anything else!
        start = new Date()
        max_time_ms = timeout*1000 # try for up to this long
        f = () =>
            @frame ?= window.frames[@iframe_uuid]
            if not @frame
                setTimeout(f, 250)
                return
            try
                # See https://github.com/sagemathinc/smc/issues/1262 -- this is especially broken on Firefox.
                @frame.require("notebook/js/outputarea").OutputArea.prototype._should_scroll = ->  # no op
            catch
                # nothing.
            innerHTML = @frame?.document?.body?.innerHTML

            if new Date() - start >= max_time_ms
                @state = 'error'
                @error = 'timeout loading'
                console.log 'Jupyter -- timeout loading'
                cb(@error)
            else
                # NOTE: we can't use '@nb.events.one "notebook_loaded.Notebook"', since we can't attach
                # to that event until events loads, and by then we may have missed the one event.
                # Also, I've observed that @frame.IPython.notebook._fully_loaded does not imply the
                # kernels are connected.
                if @frame?.IPython?.notebook?
                    @monkey_patch_frame()
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
                    @disable_autosave()
                    @remove_modal_backdrop()
                    @state = 'ready'
                    @emit('ready')
                    cb()
                else
                    console.log 'Jupyter -- not yet fully connected'
                    if @state != 'closed'
                        setTimeout(f, 1000)
        f()

    dbg: (f) =>
        return (m) -> salvus_client.dbg("JupyterWrapper.#{f}:")(misc.to_json(m))

    # Position the iframe to exactly match the underlying element; I'm calling this
    # "refresh" since that's the name of the similar method for CodeMirror.
    refresh: =>
        if @element.is(':visible')
            @iframe.show()
            @iframe.exactly_cover(@element)
        else
            @iframe.hide()

    close: () =>
        if @state == 'closed'
            return
        if @dirty_interval?
            clearInterval(@dirty_interval)
            delete @dirty_interval
        @element.html('')
        @iframe.remove()
        @removeAllListeners()
        delete @blobs
        delete @blobs_pending
        @state = 'closed'

    # save notebook file from DOM to disk
    save: (cb) =>
        # could be called when notebook is being initialized before nb is defined.
        @nb?.save_notebook(false).then(cb)

    disable_autosave: () =>
        # We have our own auto-save system
        @nb.set_autosave_interval(0)

    monkey_patch_frame: () =>
        if @_already_monkey_patched
            return
        if not @frame? or not @frame.window? or not @frame.CodeMirror?
            # If the user closes the entire window at the exact right moment, they can
            # get in a state where @frame is defined, but window is not.
            return
        @_already_monkey_patched = true
        misc_page.cm_define_diffApply_extension(@frame.CodeMirror)
        misc_page.cm_define_testbot(@frame.CodeMirror)
        @monkey_patch_logo()
        if @read_only
            @monkey_patch_read_only()
        @monkey_patch_ui()
        @monkey_patch_methods()

        # Jupyter's onbeforeunload does a bunch of stuff we don't want, e.g., it's own autosave, complaints
        # about kernel computations, possibly killing the kernel at some point, etc.  Also, having this at
        # all always seems to cause a dialog to pop up, even if the user doesn't want one according to smc's
        # own prefs.
        @frame.window.onbeforeunload = null
        # when active, periodically reset the idle timer's reset time in client_browser.Connection
        # console.log 'iframe', @iframe
        @iframe.contents().find("body").on("click mousemove keydown focusin", salvus_client.idle_reset)

    remove_modal_backdrop: =>
        # For mysterious reasons, this modal-backdrop div
        # gets left on Firefox, which makes it impossible to use.
        @frame.jQuery(".modal-backdrop").remove()

    install_custom_undo_redo: (undo, redo) =>
        @frame.CodeMirror.prototype.undo = undo
        @frame.CodeMirror.prototype.redo = redo

    monkey_patch_ui: () =>
        if not @frame? or not @iframe?[0]?.contentWindow?
            # If the user closes the entire window at the exact right moment, they can
            # cause some of what we monkey patch below to not be defined.
            return

        # FUTURE: Proper file rename with sync not supported yet
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

    monkey_patch_methods: () =>
        # Some of the stupid Jupyter methods don't properly set the dirty flag. It's just flat out bugs that they don't
        # care about, evidently.  However, they VERY MUCH matter when doing sync.
        Notebook = @frame.require("notebook/js/notebook").Notebook
        Notebook.prototype.smc_move_selection_down = Notebook.prototype.move_selection_down
        Notebook.prototype.move_selection_down = () ->
            this.smc_move_selection_down()
            this.dirty = true
        Notebook.prototype.smc_move_selection_up = Notebook.prototype.move_selection_up
        Notebook.prototype.move_selection_up = () ->
            this.smc_move_selection_up()
            this.dirty = true
        # See https://github.com/sagemathinc/smc/issues/1262 -- this is especially broken on Firefox.
        @frame.require("notebook/js/outputarea").OutputArea.prototype._should_scroll = ->  # no op

    font_size_set: (font_size) =>
        # initialization, if necessary
        if @frame.$(".smc-override").length == 0
            @frame.$('<style type="text/css" class="smc-override"></style>').appendTo(@frame.$("body"))
        # notebook: main part, "pre" the code blocks, and pager the "help" window at the bottom
        @frame.$(".smc-override").html("""
        #notebook       { font-size: #{font_size}px !important; }
        .CodeMirror pre { font-size: #{font_size}px !important; }
        div#pager       { font-size: #{font_size}px !important; }
        """)

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
    # If not read_only: returns
    #
    #      {live: string that actually got set -- may differ due to errors or factoring out images,
    #       parse_errors: true/false -- will be true if there were errors parsing the input doc.}
    #
    # If read_only: what happens on set is not guaranteed to be at all correct
    # when document is read_only, e.g., then we do not change metadata, since
    # Jupyter starts spawning kernels, and we can't stop that.
    set: (doc) =>
        if @state != 'ready'
            throw Error("state must be ready")

        #dbg = @dbg("set")
        #dbg()
        if typeof(doc) != 'string'
            throw Error("BUG -- set: doc must be of type string")

        parse_errors = false

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
                parse_errors = true
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
                            parse_errors = true
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
                        parse_errors = true
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
        return {live: res, parse_errors:parse_errors}

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
        # FUTURE: make readonly

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
        @_users   ?= redux.getStore('users')  # TODO -- obviously not like this...
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
                cursor.find(".smc-jupyter-cursor-label").css( top:'-1.8em', 'padding-left':'.5ex', 'padding-right':'.5ex', left:'.9ex', 'padding-top':'.6ex', position:'absolute', width:'16ex')
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
        # dbg = @dbg("mutate_cell")([index, obj])
        ###
        NOTE: If you need to work on this function, here's how to get an instance
        of this class. In the Javascript console, get access to this editor.  I typically
        do this by putting a line of code like window.w = @ in the constructor
        for class JupyterNotebook.

        For example, this then gets the first cell:

            w.dom.nb.get_cell(0)

        (and w.dom.nb.get_cell(0).element is the underlying DOM element)

        You can then mess around with this until you get it to work.
        ###

        cell = @nb.get_cell(index)
        obj0 = cell.toJSON()
        do_rerender_cell = false
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
        if cell.set_input_prompt? and obj0.execution_count != obj.execution_count
            cell.set_input_prompt(obj.execution_count ? '*')
        if cell.output_area? and (not underscore.isEqual(obj0.outputs, obj.outputs) or not underscore.isEqual(obj0.metadata, obj.metadata))
            cell.output_area.clear_output(false, true)
            cell.output_area.trusted = !!obj.metadata.trusted
            cell.output_area.fromJSON(obj.outputs ? [], obj.metadata)

        if cell.cell_type == 'markdown' and cell.rendered
            do_rerender_cell = true

        # Handle slideshow metadata values.
        # See setter in ipython/notebook/js/celltoolbarpresets/slideshow.js
        # and usage of setter in ipython/notebook/js/celltoolbar.js
        if obj.metadata?.slideshow? and not underscore.isEqual(obj0.metadata.slideshow, obj.metadata.slideshow)
            # 1. mutate the DOM
            select = cell.element.find(".celltoolbar select")
            select.val(obj.metadata.slideshow.slide_type)
            # 2. update cell metadata
            cell.metadata.slideshow = obj.metadata?.slideshow

        if do_rerender_cell
            cell.rendered = false  # hack to force it to actually re-render
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

    line_to_cell: (line) =>
        obj = JSON.parse(line)
        if obj.cell_type == 'code' and obj.outputs?
            for out in obj.outputs
                if out.data?
                    for k, v of out.data
                        if is_smc_subs(v)
                            blob = @load_blob(from_smc_subs(v))
                            if blob?
                                out.data[k] = blob
        return obj

    cell_to_line: (cell, to_db) =>
        obj = cell.toJSON()
        if obj.cell_type == 'code' and obj.outputs?
            obj.outputs = misc.deep_copy(obj.outputs)
            for out in obj.outputs
                if out.data?
                    for k, v of out.data
                        if do_smc_subs(v)
                            out.data[k] = to_smc_subs(@save_blob(v, to_db))
        return stringify(obj)

    save_blob: (blob, to_db) =>
        if not @blobs?
            return
        id = misc.uuidsha1(blob)
        if @blobs[id]
            return id
        @blobs[id] = blob
        if to_db
            query =
                blobs :
                    id         : id
                    blob       : blob
                    project_id : @project_id
            #console.log("saving blob with id #{id} to database")
            salvus_client.query
                query : query
                cb : (err, resp) =>
                    #console.log("saving blob got response: #{err}, #{misc.to_json(resp)}")
                    if err
                        console.warn("error saving: #{err}")
        return id

    load_blob: (id) =>
        if not @blobs?
            return
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
                    if @state == 'closed' or not @blobs?
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
        subs = to_smc_subs(id)
        for cell in @nb.get_cells()
            outputs = cell.output_area?.outputs
            if outputs?
                done = false
                for out in outputs
                    if done
                        break
                    if out.data?
                        for k, v of out.data
                            if v == subs
                                @mutate_cell(index, @line_to_cell(@cell_to_line(cell)))
                                done = true
                                break
            index += 1
        return



exports.jupyter_notebook = (parent, filename, opts) ->
    return (new JupyterNotebook(parent, filename, opts)).element

class JupyterNotebook extends EventEmitter
    constructor: (@parent, @filename, opts={}) ->
        opts = @opts = defaults opts,
            read_only         : false
            mode              : undefined   # ignored
            default_font_size : 14          # set in editor.coffee
            cb                : undefined   # optional
        if $.browser.firefox
            @element = $("<div class='alert alert-info' style='margin: 15px;'>Unfortunately, Jupyter notebooks are <a href='https://github.com/sagemathinc/smc/issues/1537' target='_blank'>not currently supported</a> in SageMathCloud using Firefox.<br>Please use <a href='https://www.google.com/chrome/browser/desktop/index.html' target='_blank'>Google Chrome</a> or Safari.</div>")
            @element.data("jupyter_notebook", @)
            opts.cb?()
            return
        @project_id = @parent.project_id
        @editor = @parent.editor
        @read_only = opts.read_only
        @element = templates.find(".smc-jupyter-notebook").clone()
        @element.data("jupyter_notebook", @)

        @_other_cursor_timeout_s = 30  # only show active other cursors for this long

        # Jupyter is proxied via the following canonical URL:
        @server_url = "#{window.smc_base_url}/#{@project_id}/port/jupyter/notebooks/"

        # special case/hack for developing SMC-in-SMC
        if window.smc_base_url.indexOf('/port/') != -1
            # Hack until we can figure out how to proxy websockets through a proxy
            # (things just get too complicated)...
            console.warn("Jupyter: assuming that SMC is being run from a project installed in the ~/smc directory!!")
            i = window.smc_base_url.lastIndexOf('/')
            @server_url = "#{window.smc_base_url.slice(0,i)}/jupyter/notebooks/smc/src/data/projects/#{@project_id}/"

        s = misc.path_split(@filename)
        @path = s.head
        @file = s.tail

        # filename for our sync-friendly representation of the Jupyter notebook
        @syncdb_filename = syncdb_filename(@filename)

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
                if @state == 'closed'
                    # This could happen in case the user closes the tab before initialization is complete.
                    return
                @init_dom_change()
                @init_syncstring_change()
                @init_dom_events()
                @init_buttons()
                @dom.install_custom_undo_redo(@undo, @redo)
                @font_size_init()
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
        if @syncstring?
            dbg("syncstring already initialized")
            cb()
            return
        dbg("initializing synchronized string '#{@syncdb_filename}'")
        syncdoc.synchronized_string
            project_id : @project_id
            filename   : @syncdb_filename
            cursors    : true
            cb         : (err, s) =>
                @syncstring = s
                cb(err)

    init_dom: (cb) =>
        if @state != 'loading'
            cb("init_dom BUG: @state must be loading")
            return

        async.series([
            (cb) =>
                console.log 'Jupyter: checking for url to be ready'
                # Use jquery until the server url loads properly (not an error), then load the iframe.
                # We do this -- which seems inefficient -- because trying to detect errors inside
                # the iframe properly is difficult.
                # $ 3.0 removed some deprecated methods. http://api.jquery.com/jquery.ajax/
                misc.retry_until_success
                    f        : (cb) => $.ajax({url:@server_url}).fail(=>cb(true)).done(=>cb())
                    max_time : 60*1000  # try for at most 1 minute
                    cb       : cb
            (cb) =>
                console.log 'Jupyter: loading iframe'
                @notebook.css('opacity',0.75)
                done = (err) =>
                    @notebook.css('opacity',1)
                    if err
                        @dom?.close()
                        delete @dom
                        cb(err)
                    else
                        if @dom.read_only
                            # DOM gets extra info about @read_only status of file from jupyter notebook server.
                            @read_only = true
                        cb()
                @dom = new JupyterWrapper(@notebook, @server_url, @filename,
                                          @read_only, @project_id, JUPYTER_LOAD_TIMEOUT_S, done)
        ], cb)

    init_buttons: () =>
        if @_init_buttons_already_done
            return
        @_init_buttons_already_done = true

        # info button
        @element.find("a[href=\"#info\"]").click(@info)

        # time travel/history
        @element.find("a[href=\"#history\"]").click(@show_history_viewer)

        # save button
        if @read_only
            @element.find("a[href=\"#save\"]").addClass('disabled')
        else
            @save_button = @element.find("a[href=\"#save\"]").click(@save)

        # publish button
        @publish_button = @element.find("a[href=\"#publish\"]").click(@publish_ui)

        @refresh_button = @element.find("a[href=\"#refresh\"]").click(@refresh)

        @element.find("a[href=\"#undo\"]").click(@undo)
        @element.find("a[href=\"#redo\"]").click(@redo)

        @font_size_decr = @element.find("a[href=\"#font-size-decrease\"]").click () =>
            @font_size_change(-1)
        @font_size_incr = @element.find("a[href=\"#font-size-increase\"]").click () =>
            @font_size_change(1)

    init_dom_events: () =>
        if @state == 'closed'
            return
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
                try
                    @dom.draw_other_cursors(account_id, locs)
                catch err
                    # This can happen during initialization in some edge cases,
                    # where Jupyter itself raises an exception.  So just ignore it
                    # (no cursor appearing temporarily is harmless).

    _handle_dom_change: () =>
        #dbg()
        if not @dom?
            return
        new_ver = @dom.get(true)  # true = save any newly created images to blob store.
        @_last_dom = new_ver
        @syncstring.live(new_ver)
        @syncstring.sync () =>
            @update_save_state()

    # listen for and handle changes to the live document
    init_dom_change: () =>
        if @read_only
            # read-only mode: ignore any DOM changes
            return
        if not @dom?
            return
        #dbg = @dbg("dom_change")
        @_last_dom = @dom.get()
        handle_dom_change = () => @_handle_dom_change()

        # DEBOUNCE:
        # We debounce so that no matter what the live doc has to be still for a while before
        # we handle any changes to it.  Since handling changes can be VERY expensive for Jupyter,
        # do to our approach from the outside (not changing the Jupyter code itself), this avoids
        # slowing the user down.  Making the debounce value large is also useful for
        # testing edge cases of the sync algorithm.
        @dom.on('change', underscore.debounce(handle_dom_change, 1500))

    # listen for changes to the syncstring
    init_syncstring_change: () =>
        #dbg = @dbg("syncstring_change"); dbg()
        if @read_only or @state == 'closed'
            return
        last_syncstring = @syncstring.live()
        handle_syncstring_change = () =>
            if @state == 'closed'
                return
            #console.log 'handle_syncstring_change'
            if @dom.state != 'ready'
                # there is nothing we can do regarding setting it if the document is broken/closed.
                return
            live = @syncstring.live()
            if last_syncstring != live
                last_syncstring = live
                # It really did change.
                #console.log("syncstring changed to '#{live}'")
                # Get current state of the DOM.  We do this even if not "dirty" -- we always get,
                # just to be absolutely sure, as this is critical to get right to avoid any data loss.
                if @dom.get(true) != live
                    # The actual current DOM is different than what we need to set it to be
                    # equal to, so... we mutate it to equal live.
                    info = @dom.set(live)
                    @_parse_errors = info.parse_errors
                    @_last_dom = result = info.live  #  what really got set.
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

        # CRITICAL: We absolutely cannot throttle incoming syncstring changes.  If we
        # did then when saving our own changes, we throw away changes already in the stream,
        # JSON corruption increases, etc.  DO NOT THROTTLE.
        ## DO NOT DO THIS -- @syncstring.on('sync', underscore.throttle(handle_syncstring_change, 2000))
        @syncstring.on('sync', handle_syncstring_change)

        # CRITICAL: if the upstream syncstring is about to change, we *must*
        # save our current state before accepting those changes.  Or local
        # work will be lost.
        @syncstring._syncstring.on "before-change", =>
            #console.log("syncstring before-change")
            # CRITICAL: We also *only* do this if there wasn't a parse error
            # when *last* set'ing.  This avoids the horrendously painful situation
            # where every client tries to "fix" a JSON parse error at once, which
            # simultaneously breaks everything even worse! Ad infinitum.  What this
            # does is make it so that if a client received a broken syncstring, and
            # sits there doing NOTHING, then they will not try to fix it.  Only a
            # client very actively doing editing (or changes from output -- which can only
            # happen in one cell), will thus do this set.  All others will stay calm
            # and let the active clients sort things out.  Since multiple users are very
            # unlikely to be heavily active at exactly the same time, especially when things
            # have gone to hell, this works in practice well.
            # There are other algorithms that involve electing leaders or some other
            # consensus protocol, to decide who fixes issues, but they would all but
            # much more complicated and brittle.
            # For testing, I do
            #    smc.editors['tmp/break.ipynb'].wrapped.testbot({n:60})
            # in a console on at least one open notebook, then open tmp/.break.ipynb.jupyter-sync
            # directly and corrupt it in all kinds of ways.
            if not @_parse_errors
                @_handle_dom_change()

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

    show: =>
        @element.show()
        @dom?.refresh()

    hide: =>
        @element.hide()
        @dom?.refresh()

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
        redux.getProjectActions(@project_id).open_file
            path       : path
            foreground : true

    # Whether or not the syncstring has unsaved changes.  This ignores
    # the Jupyter/DOM, since taking into account the DOM would make
    # this way too expensive (and any changes there will quickly get saved
    # to the syncstring, or don't matter).
    has_unsaved_changes: () =>
        # The question mark is necessary since @syncstring might not be defined when this gets called
        # (see https://github.com/sagemathinc/smc/issues/918).
        return @syncstring?._syncstring?.has_unsaved_changes()

    update_save_state: () =>
        if not @save_button? or @state != 'ready'
            return
        if @has_unsaved_changes()
            @save_button.removeClass('disabled')
        else
            @save_button.addClass('disabled')

    save: (cb) =>
        if not @save_button?
            return
        @save_button.icon_spin(start:true, delay:5000)
        async.parallel [@dom.save, @syncstring.save], (err) =>
            if not @save_button?
                return
            @save_button.icon_spin(false)
            @update_save_state()
            cb?(err)

    nbconvert: (opts) =>
        opts = defaults opts,
            format : required
            cb     : undefined
        salvus_client.exec
            path        : @path
            project_id  : @project_id
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
                redux.getProjectActions(@project_id).set_public_path(@filename, "Jupyter notebook #{@filename}")
                html = @filename.slice(0,@filename.length-5)+'html'
                status?("making '#{html}' public", 90)
                redux.getProjectActions(@project_id).set_public_path(html, "Jupyter html version of #{@filename}")
                cb()
            ], (err) =>
            status?("done", 100)
            @publish_button.find("fa-refresh").hide()
            cb?(err)
        )

    refresh: (cb) =>
        @dom?.close()
        delete @dom
        @state = 'init'
        @load(cb)

    font_size_init: () =>
        # NOTE: @parent.local_storage may not be defined, e.g., for the history viewer!
        font_size = @parent.local_storage?("font_size") ? @opts.default_font_size
        @dom.font_size_set(font_size)
        @element.data("font_size", font_size)

    font_size_change: (delta) =>
        font_size = @element.data("font_size")
        # console.log("font_size_change #{delta} applied to #{font_size}")
        if font_size?
            font_size += delta
            @dom.font_size_set(font_size)
            @parent.local_storage("font_size", font_size)
            @element.data("font_size", font_size)

    undo: () =>
        if not @syncstring.in_undo_mode()
            @_handle_dom_change()
        else if @dom.get(true) != @_last_dom  # expensive but I don't know how to handle this case otherwise since dirty checking so hard...
            @exit_undo_mode()
            @_handle_dom_change()
        @syncstring.undo()

    redo: () =>
        @syncstring.redo()

    exit_undo_mode: () =>
        @syncstring.exit_undo_mode()

    ###
    Used for testing.  Call this to have a "robot" count from 1 up to n
    in the given cell.   Will call sync after adding each number.   The
    test to do is to have several of these running at once and make
    sure all numbers are entered.  Also, try typing while this is running.
    Use like this:
            smc.editors['tmp/bot.ipynb'].wrapped.testbot()
    A good way to test is to start one of these running on one machine,
    then just try to use the same notebook on another machine.  The
    constant arrivable and merging in of new content will properly stress
    the system.
    ###
    testbot: (opts) =>
        opts = defaults opts,
            n     : 30
            delay : 1000
            index : @dom?.nb?.get_selected_index() ? 0
        cell = @dom?.nb?.get_cell(opts.index)
        if not cell?
            console.warn("no available cell to test")
        cell.code_mirror.testbot
            n     : opts.n
            delay : opts.delay
            f     : @_handle_dom_change

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
    r = cm.getOption('readOnly')
    if not r
        cm.setOption('readOnly', true)
    cm._setValueNoJump = true  # so the cursor events that happen as a direct result of this setValue know.
    cm.diffApply(dmp.diff_main(cm.getValue(), value))
    if not r
        cm.setOption('readOnly', false)
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
    constructor: (@project_id, @filename, @content, opts) ->
        @element = templates.find(".smc-jupyter-nbviewer").clone()
        @ipynb_filename = @filename.slice(0,@filename.length-4) + 'ipynb'
        @ipynb_html_src = "#{window.smc_base_url}/#{@project_id}/raw/#{@filename}"
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
                # could become undefined due to other things happening...
                @iframe?.contents().find("body").on("click mousemove keydown focusin", salvus_client.idle_reset)
            @iframe.attr('src', @ipynb_html_src)

    init_buttons: () =>
        @element.find('a[href=\"#copy\"]').click () =>
            actions = redux.getProjectActions(@project_id)
            actions.set_active_tab('files')
            actions.set_all_files_unchecked()
            actions.set_file_checked(@ipynb_filename, true)
            actions.set_file_action('copy')
            return false

        @element.find('a[href=\"#download\"]').click () =>
            actions = redux.getProjectActions(@project_id)
            actions.set_active_tab('files')
            actions.set_all_files_unchecked()
            actions.set_file_checked(@ipynb_filename, true)
            actions.set_file_action('download')
            return false

###
Functions used for defining how we replace large strings in Jupyter cell
output with sha1-uuid blobs.  In short, we replace any sufficiently
large string (as defined by SMC_SUBS_THRESH) with smc-blob::uuid, where
uuid is derived from the sha1 hash of that string.

WARNING: If you change this mapping all deployed Jupyter notebooks that used it
will have their history broken, in that images will no longer appear.
###

SMC_SUBS_PREFIX = "smc-blob::"
SMC_SUBS_THRESH = 500 # must be bigger than 36 + SMC_SUBS_PREFIX.length!

do_smc_subs = (s) ->
    return typeof(s) == 'string' and s.length > SMC_SUBS_THRESH

is_smc_subs = (s) ->
    n = SMC_SUBS_PREFIX.length
    return typeof(s) == 'string' and s.slice(0,n) == SMC_SUBS_PREFIX and misc.is_valid_uuid_string(s.slice(n))

to_smc_subs = (uuid) ->
    return "#{SMC_SUBS_PREFIX}#{uuid}"

from_smc_subs = (s) ->
    return s.slice(SMC_SUBS_PREFIX.length)
