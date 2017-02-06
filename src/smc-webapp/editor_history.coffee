##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
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
# Viewer for history of changes to a document
###############################################################################

$ = window.$

misc = require('smc-util/misc')

{salvus_client} = require('./salvus_client')
{redux} = require('./smc-react')
{FileEditor, codemirror_session_editor} = require('./editor')

sagews  = require('./sagews')
jupyter = require('./editor_jupyter')
tasks   = require('./tasks')

templates = $("#salvus-editor-templates")

underscore = require('underscore')

class exports.HistoryEditor extends FileEditor
    constructor: (@project_id, @filename, content, opts) ->
        super(@project_id, @filename)
        @init_paths()
        @init_view_doc opts, (err) =>
            if not err
                @init_syncstring()
                @init_slider()
            else
                # FUTURE: need a better way to report this
                console.warn("FAILED to configure view_doc")

    init_paths: =>
        #   @filename = "path/to/.file.sage-history"
        s = misc.path_split(@filename)
        @_path = s.tail.slice(1, s.tail.length - ".sage-history".length)
        @_open_file_path = @_path
        if s.head
            @_open_file_path = s.head + '/' + @_path
        else
            @_open_file_path = @_path
        @ext = misc.filename_extension(@_path)
        if @ext == 'ipynb'
            @_path = '.' + @_path + require('./editor_jupyter').IPYTHON_SYNCFILE_EXTENSION
        if s.head
            @_path = s.head + '/' + @_path

    init_syncstring: =>
        @syncstring = salvus_client.sync_string
            project_id : @project_id
            path       : @_path
        @syncstring.once 'connected', =>
            @render_slider()
            @render_diff_slider()
            @syncstring.on 'change', =>
                if @_diff_mode
                    @resize_diff_slider()
                else
                    @resize_slider()

            if @syncstring.has_full_history()
                @load_all.hide()
            else
                @load_all.show()

            # only show button for reverting if not read only
            @syncstring.wait_until_read_only_known (err) =>
                if not @syncstring.get_read_only()
                    @element.find("a[href=\"#revert\"]").show()

    close: () =>
        @remove()

    remove: () =>
        @syncstring?.close()
        @view_doc?.remove?()  # might not have a remove method!

    disconnect_from_session: =>
        @close()

    init_view_doc: (opts, cb) =>
        opts.mode = ''
        opts.read_only = true
        @element  = templates.find(".salvus-editor-history").clone()
        switch @ext
            when 'ipynb'
                @view_doc = jupyter.jupyter_notebook(@, @_open_file_path, opts).data("jupyter_notebook")
                @element.find("a[href=\"#show-diff\"]").hide()
            when 'tasks'
                @view_doc = tasks.task_list(undefined, undefined, {viewer:true}).data('task_list')
                @element.find("a[href=\"#show-diff\"]").hide()
            else
                @view_doc = codemirror_session_editor(@project_id, @filename, opts)

        if @ext in ['course', 'sage-chat']
            @element.find(".salvus-editor-history-no-viewer").show()
            @top_elt = @element.find(".salvus-editor-history-no-viewer")
        else
            @top_elt = @element.find(".salvus-editor-history-sliders")

        @element.find(".salvus-editor-history-history_editor").append(@view_doc.element)

        if @ext == "sagews"
            opts0 =
                allow_javascript_eval : false
                static_viewer         : true
                read_only             : true
            @worksheet = new (sagews.SynchronizedWorksheet)(@view_doc, opts0)

        if @ext == 'ipynb'
            @view_doc.once 'ready', =>
                @view_doc.element.find(".smc-jupyter-notebook-buttons").hide()
                @show()
                cb()
            @view_doc.once('failed', => cb('failed'))
        else
            cb()

    init_slider: =>
        @slider         = @element.find(".salvus-editor-history-slider")
        @forward_button = @element.find("a[href=\"#forward\"]")
        @back_button    = @element.find("a[href=\"#back\"]")
        @load_all       = @element.find("a[href=\"#all\"]")

        ##element.children().not(".btn-history").hide()
        @element.find(".salvus-editor-save-group").hide()
        @element.find(".salvus-editor-chat-title").hide()
        @element.find(".smc-editor-file-info-dropdown").hide()

        @slider.show()

        @load_all.click () =>
            @load_full_history (err) =>
                if not err
                    @load_all.hide()

        @forward_button.click () =>
            if @forward_button.hasClass("disabled")
                return false
            if @_diff_mode
                @set_doc_diff(@goto_diff(@revision_num1+1, @revision_num+1)...)
            else
                @set_doc(@goto_revision(@revision_num + 1))
            return false

        @back_button.click () =>
            if @back_button.hasClass("disabled")
                return false
            if @_diff_mode
                @set_doc_diff(@goto_diff(@revision_num1-1, @revision_num-1)...)
            else
                @set_doc(@goto_revision(@revision_num - 1))
            return false

        open_file = () =>
            redux.getProjectActions(@project_id).open_file
                path       : @_open_file_path
                foreground : true

        @element.find("a[href=\"#file\"]").click(open_file)

        @element.find("a[href=\"#revert\"]").click () =>
            if not @revision_num?
                return
            time  = @syncstring?.all_versions()?[@revision_num]
            if not time?
                return
            @syncstring.set(@syncstring.version(time))
            @syncstring.save()
            open_file()
            @syncstring.emit('change')

        @diff_slider    = @element.find(".salvus-editor-history-diff-slider")

        @element.find("a[href=\"#show-diff\"]").click () =>
            @diff_mode(true)
            return false

        @element.find("a[href=\"#hide-diff\"]").click () =>
            @diff_mode(false)
            return false

    diff_mode: (enabled) =>
        @_diff_mode = enabled
        if enabled
            @element.find("a[href=\"#hide-diff\"]").show()
            @element.find("a[href=\"#show-diff\"]").hide()
            @element.find(".salvus-editor-history-diff-mode").show()
            @diff_slider.show()
            @slider.hide()
            @set_doc_diff(@goto_diff()...)
            # Switch to default theme for diff viewer, until we implement
            # red/green colors that are selected to match the user's theme
            # See https://github.com/sagemathinc/smc/issues/884
            for cm in @view_doc.codemirrors()
                @_non_diff_theme ?= cm.getOption('theme')
                cm.setOption('theme', '')
        else
            for cm in @view_doc.codemirrors()
                cm.setOption('lineNumbers', true)
                cm.setOption('gutters', [])
                if @_non_diff_theme?
                    # Set theme back to default
                    cm.setOption('theme', @_non_diff_theme)
                cm.setValue('')
                cm.setValue(@syncstring.version(@goto_revision(@revision_num)))
            @element.find("a[href=\"#hide-diff\"]").hide()
            @element.find("a[href=\"#show-diff\"]").show()
            @element.find(".salvus-editor-history-diff-mode").hide()
            @diff_slider.hide()
            @slider.show()
            @set_doc(@goto_revision())

    set_doc: (time) =>
        if not time?
            return
        val = @syncstring.version(time)
        switch @ext
            when 'ipynb'
                @view_doc.dom.set(val)
            when 'tasks'
                @view_doc.set_value(val)
            else
                @view_doc.codemirror.setValueNoJump(val)
        @process_view()

    set_doc_diff: (time0, time1) =>
        # Set the doc to show a diff from time0 to time1
        v0 = @syncstring.version(time0)
        v1 = @syncstring.version(time1)
        {patches, to_line} = line_diff(v0, v1)
        #console.log "#{misc.to_json(patches)}"
        # [{"diffs":[[-1,"BC"],[1,"DCCCBCCECCFCGHCCICJ"]],"start1":0,"start2":0,"length1":2,"length2":19}]
        lines = []
        type  = []
        line_numbers = []
        seen_context = {}
        chunk_boundaries = []
        last_x = undefined
        len_diff = 0
        for x in patches
            n1 = x.start1; n2 = x.start2
            n1 += len_diff
            len_diff += x.length1 - x.length2
            for z in x.diffs
                for c in z[1]
                    if z[0] == -1
                        n1 += 1
                        line_numbers.push([n1, ''])
                    else if z[0] == 1
                        n2 += 1
                        line_numbers.push(['', n2])
                    else
                        n1 += 1; n2 += 1
                        key = "#{n1}-#{n2}"
                        if seen_context[key]
                            # don't show the same line twice in context, since that's confusing to readers
                            continue
                        line_numbers.push([n1, n2])
                        seen_context[key] = true
                    lines.push(to_line[c])
                    type.push(z[0])
            chunk_boundaries.push(lines.length-1)

        s = lines.join('\n')
        line_number = (i, k) ->
            return $("<span class='smc-history-diff-number'>#{line_numbers[i][k]}</span>")[0]
        for cm in @view_doc.codemirrors()
            cm.setValueNoJump(s)
            cm.setOption('lineNumbers', false)
            cm.setOption('gutters', ['smc-history-diff-gutter1', 'smc-history-diff-gutter2'])
            # highlight the lines based on type
            for i in [0...type.length]
                if type[i] == -1
                    for t in ['wrap', 'gutter']
                        cm.addLineClass(i, t,    "smc-history-diff-#{t}-delete")
                        cm.removeLineClass(i, t, "smc-history-diff-#{t}-insert")
                    cm.setGutterMarker(i, 'smc-history-diff-gutter1', line_number(i,0))
                else if type[i] == +1
                    for t in ['wrap', 'gutter']
                        cm.addLineClass(i, t,    "smc-history-diff-#{t}-insert")
                        cm.removeLineClass(i, t, "smc-history-diff-#{t}-delete")
                    cm.setGutterMarker(i, 'smc-history-diff-gutter2', line_number(i,1))
                else
                    for t in ['wrap', 'gutter']
                        cm.removeLineClass(i, t)
                        cm.removeLineClass(i, t)
                    cm.setGutterMarker(i, 'smc-history-diff-gutter1', line_number(i,0))
                    cm.setGutterMarker(i, 'smc-history-diff-gutter2', line_number(i,1))
            for i in chunk_boundaries
                cm.addLineClass(i, 'wrap', 'smc-history-diff-wrap-divide')

        # Set the list of names of users
        account_ids = {}
        for t in @syncstring.versions()
            if t > time0 and t <= time1
                account_ids[@syncstring.account_id(t)] = true

        usernames = []
        for account_id,_ of account_ids
            if account_id == @project_id
                name = "Project: " + redux.getStore('projects')?.get_title(account_id)
            else
                name = redux.getStore('users')?.get_name(account_id)
            if name?
                usernames.push(misc.trunc_middle(name,25).trim())
        if usernames.length > 0
            usernames.sort((a,b)->misc.cmp(a.toLowerCase(), b.toLowerCase()))
            username = usernames.join(', ')
        else
            username = ''
        @element.find(".salvus-editor-history-revision-user").text(username)

        @process_view()

    goto_revision: (num) =>
        if not num?
            num = @revision_num
        if not num?
            return
        versions = @syncstring.all_versions()
        if not versions?
            # not yet initialized
            return
        time = versions[num]
        if not time?
            num  = @length - 1
            time = versions[num]
        @revision_num = num
        if not time?
            return
        @slider.slider("option", "value", @revision_num)
        @update_buttons()
        t = time.toLocaleString()
        @element.find(".salvus-editor-history-revision-time").text($.timeago(t)).attr('title', t)
        @element.find(".salvus-editor-history-revision-number").text(", revision #{num+1} (of #{@length})")
        account_id = @syncstring.account_id(time)
        time_sent  = @syncstring.time_sent(time)

        if time_sent? and Math.abs(time_sent - time) < 60000  # not actually offline -- just a snapshot update..
            time_sent = undefined

        if account_id == @project_id
            name = "Project: " + redux.getStore('projects')?.get_title(account_id)
        else
            name = redux.getStore('users')?.get_name(account_id)
        if name?
            username = misc.trunc_middle(name, 50)

        else
            username = ''  # don't know user or maybe no recorded user (e.g., initial version)
        if time_sent?
            username += "  (OFFLINE WARNING: sent #{$.timeago(time_sent)}) "
        @element.find(".salvus-editor-history-revision-user").text(username)
        return time

    goto_diff: (num1, num2) =>
        if not num2?
            num2 = @revision_num
        if not num2?
            return
        if not num1?
            num1 = @revision_num1 ? Math.max(0, Math.floor(num2/2))
        versions = @syncstring.all_versions()
        if not versions?
            # not yet initialized
            return
        time1 = versions[num1]
        if not time1?
            num1  = 0
            time1 = versions[num1]
        time2 = versions[num2]
        if not time2?
            num2  = @length - 1
            time2 = versions[num2]
        @revision_num1 = num1
        @revision_num = num2
        if not time1? or not time2?
            return
        @diff_slider.slider("option", "values", [num1, num2])
        @update_buttons()
        t1 = time1.toLocaleString()
        @element.find(".salvus-editor-history-revision-time").text($.timeago(t1)).attr('title', t1)
        t2 = time2.toLocaleString()
        @element.find(".salvus-editor-history-revision-time2").text($.timeago(t2)).attr('title', t2)
        @element.find(".salvus-editor-history-revision-number").text(", revisions #{num1+1} to #{num2+1} (of #{@length})")
        return [time1, time2]

    update_buttons: =>
        if @revision_num == 0         then @back_button.addClass("disabled")    else @back_button.removeClass("disabled")
        if @revision_num == @length-1 then @forward_button.addClass("disabled") else @forward_button.removeClass("disabled")

    render_slider: =>
        @length = @syncstring.all_versions().length
        @revision_num = @length - 1
        if @ext != "" and require('./editor').file_associations[@ext]?.opts.mode?
            @view_doc.codemirror?.setOption("mode", require('./editor').file_associations[@ext].opts.mode)

        # debounce actually setting the document content just a little
        set_doc = underscore.debounce(((time)=>@set_doc(time)), 150)
        @slider.slider
            animate : false
            min     : 0
            max     : @length - 1
            step    : 1
            value   : @revision_num
            slide  : (event, ui) =>
                set_doc(@goto_revision(ui.value))

        @set_doc(@goto_revision(@revision_num))

    resize_slider: =>
        new_len = @syncstring.all_versions().length
        if new_len == @length
            return
        @length = new_len
        @slider.slider
            max : @length - 1
        @update_buttons()
        @goto_revision()

    render_diff_slider: =>
        @length = @syncstring.all_versions().length
        @revision_num = @length - 1
        # debounce actually setting the document content just a little
        set_doc = underscore.debounce(((time)=>if time? then @set_doc_diff(time[0], time[1])), 150)
        @diff_slider.slider
            animate : false
            min     : 0
            max     : @length - 1
            step    : 1
            values  : [Math.max(Math.floor(@revision_num/2), 0), @revision_num]
            range   : true
            slide  : (event, ui) => # OPTIMIZATION: debounce this
                if ui.values[0] >= ui.values[1]
                    ui.values[0] = Math.max(0, ui.values[1] - 1)
                    setTimeout((()=>@diff_slider.slider(values : ui.values)), 200)
                else
                    set_doc(@goto_diff(ui.values[0], ui.values[1]))

    resize_diff_slider: =>
        new_len = @syncstring.all_versions().length
        if new_len == @length
            return
        @length = new_len
        @diff_slider.slider
            max : @length - 1
        @goto_diff()

    process_view: () =>
        if @ext == 'sagews'
            @worksheet.process_sage_updates()

    mount: () =>
        if not @mounted
            $(document.body).append(@element)
            @mounted = true
        return @mounted

    show: =>
        if not @is_active() or not @element? or not @view_doc?
            return
        @element.show()
        @view_doc.show()
        if @ext == 'sagews'
            @worksheet?.process_sage_updates()

    hide: =>
        @view_doc?.hide()

    load_full_history: (cb) =>
        n = @syncstring.all_versions().length
        @syncstring.load_full_history (err) =>
            if err
                cb?(err)
            else
                if @_diff_mode
                    @resize_diff_slider()
                else
                    @resize_slider()
                if @revision_num?
                    num_added = @syncstring.all_versions().length - n
                    @goto_revision(@revision_num + num_added)
                cb?()

# Compute a line-level diff between two strings, which
# is useful when showing a diff between two states.
{dmp} = require('smc-util/syncstring')
line_diff = (v0, v1) ->
    string_mapping = new misc.StringCharMapping()
    result =
        patches : dmp.patch_make(string_mapping.to_string(v0.split('\n')), string_mapping.to_string(v1.split('\n')))
        to_line : string_mapping._to_string
    return result