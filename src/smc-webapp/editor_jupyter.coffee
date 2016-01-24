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

async                = require('async')

misc                 = require('smc-util/misc')
{defaults, required} = misc

{salvus_client}      = require('./salvus_client')

{redux}              = require('./smc-react')

diffsync             = require('diffsync')
syncdoc              = require('./syncdoc')

{synchronized_db} = require('./syncdb')

templates            = $(".smc-jupyter-templates")

editor_templates     = $("#salvus-editor-templates")

exports.IPYTHON_SYNCFILE_EXTENSION = IPYTHON_SYNCFILE_EXTENSION = ".jupyter-sync"

exports.jupyter_nbviewer = (editor, filename, content, opts) ->
    X = new JupyterNBViewer(editor, filename, content, opts)
    element = X.element
    element.data('jupyter_nbviewer', X)
    return element

class JupyterNBViewer
    constructor: (@editor, @filename, @content, opts) ->
        @element = templates.find(".smc-jupyter-nbviewer").clone()
        @ipynb_filename = @filename.slice(0,@filename.length-4) + 'ipynb'
        @init_buttons()

    show: () =>
        if not @iframe?
            @iframe = @element.find(".smc-jupyter-nbviewer-content").find('iframe')
            # We do this, since otherwise just loading the iframe using
            #      @iframe.contents().find('html').html(@content)
            # messes up the parent html page, e.g., foo.modal() is gone.
            @iframe.contents().find('body')[0].innerHTML = @content

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

# Download a remote URL, possibly retrying repeatedly with exponential backoff
# on the timeout.
# If the downlaod URL contains bad_string (default: 'ECONNREFUSED'), also retry.
get_with_retry = (opts) ->
    opts = defaults opts,
        url           : required
        initial_timeout : 5000
        max_timeout     : 20000     # once delay hits this, give up
        factor        : 1.1     # for exponential backoff
        bad_string    : 'ECONNREFUSED'
        cb            : required  # cb(err, data)  # data = content of that url
    timeout = opts.initial_timeout
    delay   = 50
    f = () =>
        if timeout >= opts.max_timeout  # too many attempts
            opts.cb("unable to connect to remote server")
            return
        $.ajax(
            url     : opts.url
            timeout : timeout
            success : (data) ->
                if data.indexOf(opts.bad_string) != -1
                    timeout *= opts.factor
                    setTimeout(f, delay)
                else
                    opts.cb(false, data)
        ).fail(() ->
            timeout *= opts.factor
            delay   *= opts.factor
            setTimeout(f, delay)
        )

    f()

# Embedded editor for editing IPython notebooks.  Enhanced with sync and integrated into the
# overall cloud look.

exports.jupyter_notebook = (editor, filename, opts) ->
    J = new JupyterNotebook(editor, filename, opts)
    return J.element

class JupyterNotebook
    dbg: (f, m...) =>
        return salvus_client.dbg("JupyterNotebook.#{f}:")(misc.to_json(m))

    constructor: (@editor, @filename, opts={}) ->
        opts = @opts = defaults opts,
            sync_interval   : 2000
            cursor_interval : 2000
            read_only       : false
            mode            : undefined   # ignored
        window.s = @
        @element = templates.find(".smc-jupyter-notebook").clone()
        @_other_cursor_timeout_s = 30  # only show active other cursors for this long

        @_users = smc.redux.getStore('users')

        if @opts.read_only
            @readonly = true
            @element.find(".smc-jupyter-notebook-buttons").remove()

        @element.data("jupyter_notebook", @)

        # Jupyter is proxied via the following canonical URL (don't have to guess at the port):
        @server_url = "#{window.smc_base_url}/#{@editor.project_id}/port/jupyter/notebooks/"

        # special case/hack:
        if window.smc_base_url.indexOf('/port/') != -1
            # HORRIBLE hack until we can figure out how to proxy websockets through a proxy
            # (things just get too complicated)...
            console.warn("Jupyter: assuming that SMC is being run from a project installed in the ~/smc directory!!")
            i = window.smc_base_url.lastIndexOf('/')
            @server_url = "#{window.smc_base_url.slice(0,i)}/jupyter/notebooks/smc/src/data/projects/#{@editor.project_id}/"

        @_start_time = misc.walltime()
        if window.smc_base_url != ""
            # TODO: having a base_url doesn't imply necessarily that we're in a dangerous devel mode...
            # (this is just a warning).
            # The solutiion for this issue will be to set a password whenever ipython listens on localhost.
            @element.find(".smc-jupyter-notebook-danger").show()
            setTimeout( ( () => @element.find(".smc-jupyter-notebook-danger").hide() ), 3000)

        @status_element = @element.find(".smc-jupyter-notebook-status-messages")
        @init_buttons()
        s = misc.path_split(@filename)
        @path = s.head
        @file = s.tail

        if @path
            @syncdb_filename = @path + '/.' + @file + IPYTHON_SYNCFILE_EXTENSION
        else
            @syncdb_filename = '.' + @file + IPYTHON_SYNCFILE_EXTENSION

        # This is where we put the page itself
        @notebook = @element.find(".smc-jupyter-notebook-notebook")
        @con      = @element.find(".smc-jupyter-notebook-connecting")
        @setup (err) =>
            if err
                cb?(err)
            # TODO: We have to do this stupid thing because in IPython's notebook.js they don't systematically use
            # set_dirty, sometimes instead just directly setting the flag.  So there's no simple way to know exactly
            # when the notebook is dirty. (TODO: fix all this via upstream patches.)

            @_autosync_interval = setInterval(@autosync, @opts.sync_interval)
            @_cursor_interval   = setInterval(@broadcast_cursor_pos, @opts.cursor_interval)


    status: (text) =>
        if not text?
            text = ""
        else if false
            text += " (started at #{Math.round(misc.walltime(@_start_time))}s)"
        @status_element.html(text)

    # Return the last modification time of the .ipynb file on disk.
    # TODO: this has nothing to do with ipynb files -- refactor...
    get_ipynb_file_timestamp: (cb) =>
        salvus_client.exec
            project_id : @editor.project_id
            path       : @path
            command    : "stat"   # %Z below = time of last change, seconds since Epoch; use this not %Y since often users put file in place, but with old time
            args       : ['--printf', '%Z ', @file]
            timeout    : 20
            err_on_exit: false
            cb         : (err, output) =>
                if err
                    cb(err)
                else if output.stderr.indexOf('such file or directory') != -1
                    # ipynb file doesn't exist
                    cb(undefined, 0)
                else
                    cb(undefined, parseInt(output.stdout)*1000)

    setup: (cb) =>
        if @_setting_up
            cb?("already setting up")
            return  # already setting up
        @_setting_up = true
        @con.show().icon_spin(start:true)
        delete @_cursors   # Delete all the cached cursors in the DOM
        delete @nb
        delete @frame

        async.series([
            (cb) =>
                @status("Getting last time that ipynb file was modified")
                @get_ipynb_file_timestamp (err, x) =>
                    @_ipynb_last_modified = x
                    cb(err)
            (cb) =>
                @status("Ensuring synchronization file exists")
                @editor.project_page.ensure_file_exists
                    path  : @syncdb_filename
                    alert : false
                    cb    : (err) =>
                        if err
                            # unable to create syncdoc file -- open in non-sync read-only mode.
                            @readonly = true
                        cb()
            (cb) =>
                @initialize(cb)
            (cb) =>
                if @readonly
                    @dbg("setup", "readonly")
                    # TODO -- change UI to say *READONLY*
                    @iframe.css(opacity:1)
                    @save_button.text('Readonly').addClass('disabled')
                    @show()
                    for c in @nb.get_cells()
                        c.code_mirror?.setOption('readOnly',true)
                    cb()
                else
                    @dbg("setup", "_init_doc")
                    @_init_doc(cb)
        ], (err) =>
            @con.show().icon_spin(false).hide()
            @_setting_up = false
            if err
                @save_button.addClass("disabled")
                @status("Failed to start -- #{err}")
                cb?("Unable to start Jupyter notebook server -- #{err}")
            else
                cb?()
        )

    show_history_viewer: () =>
        path = misc.history_path(@filename)
        @dbg("show_history_viewer", path)
        @editor.project_page.open_file
            path       : path
            foreground : true

    _init_doc: (cb) =>
        if @opts.read_only
            cb()
            return

        #console.log("_init_doc: connecting to sync session")
        @status("Connecting to synchronized editing session...")
        if @doc?
            # already initialized
            @doc.sync () =>
                @set_nb_from_doc()
                @iframe.css(opacity:1)
                @show()
                cb?()
            return
        syncdoc.synchronized_string
            project_id        : @editor.project_id
            filename          : @syncdb_filename
            cb                : (err, doc) =>
                @status()
                if err
                    cb?("Unable to connect to synchronized document server -- #{err}")
                else
                    @doc = doc
                    console.log(@_ipynb_last_modified, @doc._syncstring.last_changed() - 0)
                    if @_ipynb_last_modified >= @doc._syncstring.last_changed() - 0
                        console.log("set from visible")
                        # set the syncstring from the visible notebook, just loaded from the file
                        @doc.live(@nb_to_string())
                    else
                        console.log("set from syncstring")
                        # set the visible notebook from the synchronized string
                        @set_nb_from_doc()
                    @_config_doc()
                    cb?()

    _config_doc: () =>
        if @opts.read_only
            cb()
            return
        @dbg("_config_doc")
        # todo -- should check if .ipynb file is newer... ?
        @status("Displaying Jupyter Notebook")
        @dbg("_config_doc", "DONE SETTING!")

        @iframe.css(opacity:1)
        @show()

        @doc._syncstring.on 'before-save', () =>
            if not @nb? or @_reloading
                # no point -- reinitializing the notebook frame right now...
                return
            #@dbg("about to sync with upstream")
            # We ensure that before we sync with upstream, the live
            # syncstring equals what is in the DOM.
            @before_sync = @nb_to_string()
            @doc.live(@before_sync)

        @doc._syncstring.on 'before-change', () =>
            @doc.live(@nb_to_string())

        @doc.on 'sync', () =>
            # We just sync'ed with upstream.
            after_sync = @doc.live()
            if @before_sync != after_sync
                # Apply any upstream changes to the DOM.
                #console.log("sync - before='#{@before_sync}'")
                #console.log("sync - after='#{after_sync}'")
                @_last_remote_change = new Date()  # used only for stupid temporary broadcast_cursor_pos hack below.
                @set_nb_from_doc()

        @doc._syncstring.on('cursor_activity', @render_other_cursor)

        @status()

    broadcast_cursor_pos: () =>
        if not @nb? or @readonly or not @doc?
            # no point -- reloading or loading or read-only
            return
        # This is an ugly hack to ignore cursor movements resulting from remote changes.
        caused = not @_last_remote_change? or @_last_remote_change - new Date() != 0
        index = @nb.get_selected_index()
        cell  = @nb.get_cell(index)
        if not cell?
            return
        cm = cell.code_mirror
        # Get the locations of *all* cursors (and the cell index i).
        locs = ({i:index, x:c.anchor.ch, y:c.anchor.line} for c in cm.listSelections())
        s = misc.to_json(locs)
        if s != @_last_cursor_pos
            @_last_cursor_pos = s
            @doc._syncstring.set_cursor_locs(locs, caused)

    render_other_cursor: (account_id) =>
        if account_id == salvus_client.account_id
            # nothing to do -- we don't draw our own cursor via this
            return
        console.log('render_other_cursor', account_id)
        x = @doc._syncstring.get_cursors()?.get(account_id)
        if not x?
            return
        # important: must use server time to compare, not local time.
        if salvus_client.server_time() - x.get('time') <= @_other_cursor_timeout_s*1000
            locs = x.get('locs')?.toJS()
            if locs?
                #console.log("draw cursors for #{account_id} at #{misc.to_json(locs)} expiring after #{@_other_cursor_timeout_s}s")
                @draw_other_cursors(account_id, locs, x.get('caused'))

    # TODO: this code is almost identical to code in syncdoc.coffee.
    draw_other_cursors: (account_id, locs, caused) =>
        # ensure @_cursors is defined; this is map from key to ...?
        @_cursors ?= {}
        x = @_cursors[account_id]
        if not x?
            x = @_cursors[account_id] = []
        # First draw/update all current cursors
        for [i, loc] in misc.enumerate(locs)
            pos   = {line:loc.y, ch:loc.x}
            data  = x[i]
            name  = misc.trunc(@_users.get_first_name(account_id), 10)
            color = @_users.get_color(account_id)
            if not data?
                if not caused
                    # don't create non user-caused cursors
                    continue
                cursor = @frame.$("<div>").html('<div class="smc-editor-codemirror-cursor"><span class="smc-editor-codemirror-cursor-label"></span><div class="smc-editor-codemirror-cursor-inside">&nbsp;&nbsp;&nbsp;</div></div>')
                cursor.css(position: 'absolute', width:'15em')
                inside = cursor.find(".smc-editor-codemirror-cursor-inside")
                inside.css
                    position : 'absolute'
                    top      : '-1.3em'
                    left     : '1ex'
                    height   : '1.2em'
                    width    : '1px'
                    'border-left' : "1px solid #{color}"

                label = cursor.find(".smc-editor-codemirror-cursor-label")
                label.css
                    'position'         : 'absolute'
                    'top'              : '-2.4em'
                    'font-size'        : '8pt'
                    'font-family'      : 'serif'
                    left               : '1ex'
                    'background-color' : 'rgba(255, 255, 255, 0.8)'
                    'z-index'          : 10000

                label.text(name)
                data = x[i] = {cursor: cursor}
            if name != data.name
                data.cursor.find(".smc-editor-codemirror-cursor-label").text(name)
                data.name = name
            if color != data.color
                data.cursor.find(".smc-editor-codemirror-cursor-inside").css('border-left': "1px solid #{color}")
                data.cursor.find(".smc-editor-codemirror-cursor-label" ).css(color: color)
                data.color = color

            # Place cursor in the editor in the right spot
            @nb?.get_cell(loc.i)?.code_mirror.addWidget(pos, data.cursor[0], false)

            if caused  # if not user caused will have been fading already from when created
                # Update cursor fade-out
                # LABEL: first fade the label out
                data.cursor.find(".smc-editor-codemirror-cursor-label").stop().animate(opacity:1).show().fadeOut(duration:8000)
                # CURSOR: then fade the cursor out (a non-active cursor is a waste of space)
                data.cursor.find(".smc-editor-codemirror-cursor-inside").stop().animate(opacity:1).show().fadeOut(duration:15000)

        if x.length > locs.length
            # Next remove any cursors that are no longer there (e.g., user went from 5 cursors to 1)
            for i in [locs.length...x.length]
                #console.log('removing cursor ', i)
                x[i].cursor.remove()
            @_cursors[account_id] = x.slice(0, locs.length)

    remove: () =>
        if @_sync_check_interval?
            clearInterval(@_sync_check_interval)
        if @_cursor_interval?
            clearInterval(@_cursor_interval)
        if @_autosync_interval?
            clearInterval(@_autosync_interval)
        if @_reconnect_interval?
            clearInterval(@_reconnect_interval)
        @element.remove()
        @doc?.disconnect_from_session()
        @_dead = true

    # Initialize the embedded iframe and wait until the notebook object in it is initialized.
    # If this returns (calls cb) without an error, then the @nb attribute must be defined.
    initialize: (cb) =>
        @dbg("initialize")
        @status("Rendering Jupyter notebook")
        get_with_retry
            url : @server_url
            cb  : (err) =>
                if err
                    @dbg("_init_iframe", "error", err)
                    @status()
                    #console.log("exit _init_iframe 2")
                    cb(err); return

                @iframe_uuid = misc.uuid()
                @dbg("initialize", "loading notebook...")

                @status("Loading Jupyter notebook...")
                @iframe = $("<iframe name=#{@iframe_uuid} id=#{@iframe_uuid}>")
                    .attr('src', "#{@server_url}#{@filename}")
                    .attr('frameborder', '0')
                    .attr('scrolling', 'no')
                @notebook.html('').append(@iframe)
                @show()

                # Monkey patch the IPython html so clicking on the IPython logo pops up a new tab with the dashboard,
                # instead of messing up our embedded view.
                attempts = 0
                delay = 200
                iframe_time = start_time = misc.walltime()
                # What f does below is purely inside the browser DOM -- not the network, so doing it
                # frequently is not a serious problem for the server.
                f = () =>
                    #console.log("iframe_time = ", misc.walltime(iframe_time))
                    if misc.walltime(iframe_time) >= 15
                        # If load fails after about this long, then we hit this error
                        # due to require.js configuration of Ipython, which I don't want to change:
                        #    "Error: Load timeout for modules: services/contents,custom/custom"
                        @iframe = $("<iframe name=#{@iframe_uuid} id=#{@iframe_uuid}>").attr('src', "#{@server_url}#{@filename}")
                        @notebook.html('').append(@iframe)
                        iframe_time = misc.walltime()
                        setTimeout(f, 300)
                        return
                    #console.log("(attempt #{attempts}, time #{misc.walltime(start_time)}): @frame.ipython=#{@frame?.IPython?}, notebook = #{@frame?.IPython?.notebook?}, kernel= #{@frame?.IPython?.notebook?.kernel?}")
                    if @_dead?
                        cb("dead"); return
                    attempts += 1
                    if delay <= 1000  # exponential backoff up to a bound
                        delay *= 1.4
                    if attempts >= 80
                        # give up after this much time.
                        msg = "Failed to load Jupyter notebook"
                        @status(msg)
                        #console.log("exit _init_iframe 3")
                        cb(msg)
                        return
                    @frame = window.frames[@iframe_uuid]
                    if not @frame? or not @frame?.$? or not @frame.IPython? or not @frame.IPython.notebook? or not @frame.IPython.notebook.kernel?
                        setTimeout(f, delay)
                    else
                        if @opts.read_only
                            $(@frame.document).find("#menubar").remove()
                            $(@frame.document).find("#maintoolbar").remove()

                        a = @frame.$("#ipython_notebook").find("a")
                        if a.length == 0
                            setTimeout(f, delay)
                        else
                            @ipython = @frame.IPython
                            if not @ipython.notebook?
                                msg = "BUG -- Something went wrong -- notebook object not defined in Jupyter frame"
                                @status(msg)
                                #console.log("exit _init_iframe 4")
                                cb(msg)
                                return
                            @nb = @ipython.notebook

                            if @readonly
                                @nb.kernel.stop_channels()  # ensure computations don't get sent to kernel

                            a.click () =>
                                @info()
                                return false

                            # Proper file rename with sync not supported yet (but will be -- TODO;
                            # needs to work with sync system)
                            @frame.$("#notebook_name").unbind('click').css("line-height",'0em')

                            # Get rid of file menu, which weirdly and wrongly for sync replicates everything.
                            for cmd in ['new', 'open', 'copy', 'rename']
                                @frame.$("#" + cmd + "_notebook").remove()

                            @frame.$("#save_checkpoint").remove()
                            @frame.$("#restore_checkpoint").remove()
                            @frame.$("#save-notebook").remove()  # in case they fix the typo

                            @frame.$(".checkpoint_status").remove()
                            @frame.$(".autosave_status").remove()

                            @frame.$("#menus").find("li:first").find(".divider").remove()

                            # This makes the ipython notebook take up the full horizontal width, which is more
                            # consistent with the rest of SMC.   Also looks better on mobile.
                            @frame.$('<style type=text/css></style>').html(".container{width:98%; margin-left: 0;}").appendTo(@frame.$("body"))

                            if not require('./feature').IS_MOBILE
                                @frame.$("#site").css("padding-left", "20px")

                            # We have our own auto-save system
                            @nb.set_autosave_interval(0)

                            #if @readonly
                            #    @frame.$("#save_widget").append($("<b style='background: red;color: white;padding-left: 1ex; padding-right: 1ex;'>This is a read only document.</b>"))

                            @status()
                            @dbg("initialize", "DONE")
                            cb()

                setTimeout(f, delay)

    autosync: () =>
        if @readonly or @_reloading
            return
        if @nb?.dirty and @nb.dirty != 'clean'
            @dbg("autosync")
            # nb.dirty is used internally by IPython so we shouldn't change it's truthiness.
            # However, we still need a way in Sage to know that the notebook isn't dirty anymore.
            @nb.dirty = 'clean'
            #console.log("causing sync")
            @save_button.removeClass('disabled')
            @sync()

    sync: (cb) =>
        if @readonly or not @doc?
            cb?()
            return
        @editor.activity_indicator(@filename)
        @save_button.icon_spin(start:true, delay:3000)
        @dbg("sync", "start")
        @doc.sync () =>
            @dbg("sync", "done")
            @save_button.icon_spin(false)
            cb?()

    has_unsaved_changes: () =>
        return not @save_button.hasClass('disabled')

    save: (cb) =>
        if not @nb? or @readonly or not @doc?
            cb?(); return
        @save_button.icon_spin(start:true, delay:4000)
        @nb.save_notebook?(false)
        @doc.save () =>
            @save_button.icon_spin(false)
            @save_button.addClass('disabled')
            cb?()

    # Set the the visible notebook in the DOM from the synchronized string
    set_nb_from_doc: () =>
        current = @nb_to_string()
        if not current? or not @doc?
            return
        if @doc.live() != current
            @set_nb(@doc.live())

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

    reload: () =>
        if @_reloading
            return
        @_reloading = true
        @_cursors = {}
        @reload_button.find("i").addClass('fa-spin')
        @initialize (err) =>
            @_init_doc () =>
                @_reloading = false
                @status('')
                @reload_button.find("i").removeClass('fa-spin')

    init_buttons: () =>
        @element.find("a").tooltip(delay:{show: 500, hide: 100})
        @save_button = @element.find("a[href=#save]").click () =>
            @save()
            return false

        @reload_button = @element.find("a[href=#reload]").click () =>
            @reload()
            return false

        @publish_button = @element.find("a[href=#publish]").click () =>
            @publish_ui()
            return false

        #@element.find("a[href=#json]").click () =>
        #    console.log(@to_obj())

        @element.find("a[href=#info]").click () =>
            @info()
            return false

        @element.find("a[href=#close]").click () =>
            @editor.project_page.display_tab("project-file-listing")
            return false

        @element.find("a[href=#execute]").click () =>
            @nb?.execute_selected_cell()
            return false
        @element.find("a[href=#interrupt]").click () =>
            @nb?.kernel.interrupt()
            return false
        @element.find("a[href=#tab]").click () =>
            @nb?.get_cell(@nb?.get_selected_index()).completer.startCompletion()
            return false

        @element.find("a[href=#history]").show().click(@show_history_viewer)

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
        #d = (m) => console.log("ipython.publish('#{@filename}'): #{misc.to_json(m)}")
        #d()
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

    to_obj: () =>
        #console.log("to_obj: start"); t = misc.mswalltime()
        if not @nb?
            # can't get obj
            return undefined
        obj = @nb.toJSON()
        obj.metadata.name  = @nb.notebook_name
        obj.nbformat       = @nb.nbformat
        obj.nbformat_minor = @nb.nbformat_minor
        #console.log("to_obj: done", misc.mswalltime(t))
        return obj

    delete_cell: (index) =>
        @dbg("delete_cell", index)
        @nb?.delete_cell(index)

    insert_cell: (index, cell_data) =>
        @dbg("insert_cell", index)
        if not @nb?
            return
        new_cell = @nb.insert_cell_at_index(cell_data.cell_type, index)
        try
            new_cell.fromJSON(cell_data)
        catch e
            console.log("insert_cell fromJSON error -- #{e} -- cell_data=",cell_data)
            window.cell_data = cell_data

    set_cell: (index, cell_data) =>
        #console.log("set_cell: start"); t = misc.mswalltime()
        @dbg("set_cell", index, cell_data)
        if not @nb?
            return

        cell = @nb.get_cell(index)

        # Add a new one then deleting existing -- correct order avoids flicker/jump
        new_cell = @nb.insert_cell_at_index(cell_data.cell_type, index)
        try
            new_cell.fromJSON(cell_data)
            if @readonly
                new_cell.code_mirror.setOption('readOnly',true)
        catch e
            console.log("set_cell fromJSON error -- #{e} -- cell_data=",cell_data)
        @nb.delete_cell(index + 1)

        # TODO: If this cell was focused and our cursors were in this cell, we put them back:


        #console.log("set_cell: done", misc.mswalltime(t))

    # Notebook Doc Format: line 0 is meta information in JSON.
    # Rest of file has one line for each cell for rest of file, in JSON format.
    #
    remove_images: (cell) =>
        return # for now
        if cell.outputs?
            for out in cell.outputs
                if out.data?
                    for k, v of out.data
                        if k.slice(0,6) == 'image/'
                            delete out.data[k]

    restore_images: (cell) =>
        return

    cell_to_line: (cell) =>
        cell = misc.copy(cell)
        @remove_images(cell)
        return misc.to_json(cell)

    line_to_cell: (line) =>
        try
            cell = misc.from_json(line)
            @restore_images(cell)
            return cell
        catch e
            console.warn("line_to_cell('#{line}') -- source ERROR=", e)
            return

    # Convert the visible displayed notebook into a textual sync-friendly string
    nb_to_string: () =>
        tm = misc.mswalltime()
        #@dbg("nb_to_string", "computing")
        obj = @to_obj()
        if not obj?
            return
        doc = misc.to_json({notebook_name:obj.metadata.name})
        for cell in obj.cells
            doc += '\n' + @cell_to_line(cell)
        @nb.dirty = 'clean' # see comment in autosync
        #@dbg("nb_to_string", "time", misc.mswalltime(tm))
        return doc

    # Transform the visible displayed notebook view into exactly what is described by the string doc.
    set_nb: (doc) =>
        @dbg("set_nb")
        tm = misc.mswalltime()
        if not @nb?
            # The live notebook is not currently initialized -- there's nothing to be done for now.
            # This can happen if reconnect (to hub) happens at the same time that user is reloading
            # the ipython notebook frame itself.   The doc will get set properly at the end of the
            # reload anyways, so no need to set it here.
            return

        # what we want visible document to look like
        goal = doc.split('\n')

        # what the actual visible document looks like
        live = @nb_to_string()?.split('\n')

        if not live? # no visible doc?
            # reloading...
            return

        # first line is metadata...
        @nb.metadata.name  = goal[0].notebook_name

        v0    = live.slice(1)
        v1    = goal.slice(1)
        string_mapping = new misc.StringCharMapping()
        v0_string  = string_mapping.to_string(v0)
        v1_string  = string_mapping.to_string(v1)
        diff = diffsync.dmp.diff_main(v0_string, v1_string)

        index = 0
        i = 0

        @dbg("set_nb", "diff", diff)
        i = 0
        while i < diff.length
            chunk = diff[i]
            op    = chunk[0]  # -1 = delete, 0 = leave unchanged, 1 = insert
            val   = chunk[1]
            if op == 0
                # skip over  cells
                index += val.length
            else if op == -1
                # Deleting cell
                # A common special case arises when one is editing a single cell, which gets represented
                # here as deleting then inserting.  Replacing is far more efficient than delete and add,
                # due to the overhead of creating codemirror instances (presumably).  (Also, there is a
                # chance to maintain the cursor later.)
                if i < diff.length - 1 and diff[i+1][0] == 1 and diff[i+1][1].length == val.length
                    #console.log("replace")
                    for x in diff[i+1][1]
                        obj = @line_to_cell(string_mapping._to_string[x])
                        if obj?
                            @set_cell(index, obj)
                        index += 1
                    i += 1 # skip over next chunk
                else
                    #console.log("delete")
                    for j in [0...val.length]
                        @delete_cell(index)
            else if op == 1
                # insert new cells
                #console.log("insert")
                for x in val
                    obj = @line_to_cell(string_mapping._to_string[x])
                    if obj?
                        @insert_cell(index, obj)
                    index += 1
            else
                console.log("BUG -- invalid diff!", diff)
            i += 1

        @dbg("set_nb", "time=", misc.mswalltime(tm))

    focus: () =>
        # TODO
        # console.log("ipython notebook focus: todo")

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
        # console.log("top=#{top}; setting maxheight for iframe =", @iframe)
        @iframe?.attr('width', width).maxheight()
        setTimeout((()=>@iframe?.maxheight()), 1)   # set it one time more the next render loop.








