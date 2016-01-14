###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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


# standard non-SMC libraries
immutable  = require('immutable')
underscore = require('underscore')

# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('./salvus_client')

{synchronized_string} = require('./syncdoc')

# React libraries
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Loading} = require('r_misc')
{Input} = require('react-bootstrap')

redux_name = (project_id, filename) ->
    return "editor-#{project_id}-#{filename}"

class CodemirrorActions extends Actions
    report_error: (mesg) =>
        @setState(error:mesg)

    sync: =>
        @set_value(@syncstring.live())

    set_style: (style) =>
        @setState
            style: misc.merge(style, @redux.getStore(@name).get('style').toJS())

    set_value: (value) =>
        if @redux.getStore(@name).get('value') != value
            @setState(value: value)
            @syncstring.live(value)
            @syncstring.sync()

    set_scroll_info: (scroll_info) =>
        @setState(scroll_info: scroll_info)

    # This is used to save the state of the document (scroll positions, etc.)
    # This does *NOT* change the document to have this doc.
    set_codemirror_doc: (doc) =>
        @setState(doc : doc)

default_store_state =
    style :
        border     : '1px solid grey'
        'font-family': 'monospace !important'
    value : ''
    options : {}
###
        mode                      : required
        read_only                 : false
        line_numbers              : @props.editor_settings.line_numbers
        first_line_number         : @props.editor_settings.first_line_number
        show_trailing_whitespace  : @props.editor_settings.show_trailing_whitespace
        indent_unit               : @props.editor_settings.indent_unit
        tab_size                  : @props.editor_settings.tab_size
        smart_indent              : @props.editor_settings.smart_indent
        electric_chars            : @props.editor_settings.electric_chars
        undo_depth                : @props.editor_settings.undo_depth
        match_brackets            : @props.editor_settings.match_brackets
        auto_close_brackets       : @props.editor_settings.auto_close_brackets
        auto_close_xml_tags       : @props.editor_settings.auto_close_xml_tags
        line_wrapping             : @props.editor_settings.line_wrapping
        style_active_line         : 15    # @props.editor_settings.style_active_line  # (a number between 0 and 127)
        spaces_instead_of_tabs    : @props.editor_settings.spaces_instead_of_tabs
        match_xml_tags            : @props.editor_settings.match_xml_tags
        code_folding              : @props.editor_settings.code_folding
        bindings                  : @props.editor_settings.bindings  # 'standard', 'vim', or 'emacs'
        theme                     : @props.editor_settings.theme
        track_revisions           : @props.editor_settings.track_revisions
        delete_trailing_whitespace: editor_settings.strip_trailing_whitespace  # delete on save
        public_access             : false

        # I'm making the times below very small for now.  If we have to adjust these to reduce load, due to lack
        # of capacity, then we will.  Or, due to lack of optimization (e.g., for big documents). These parameters
        # below would break editing a huge file right now, due to slowness of applying a patch to a codemirror editor.

        cursor_interval           : 1000   # minimum time (in ms) between sending cursor position info to hub -- used in sync version
        sync_interval             : 500    # minimum time (in ms) between synchronizing text with hub. -- used in sync version below

        completions_size          : 20    # for tab completions (when applicable, e.g., for sage sessions)
###

exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    console.log("store=smc.redux.getStore('#{name}');actions=smc.redux.getActions('#{name}');")
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, CodemirrorActions)
    store   = redux.createStore(name, default_store_state)

    console.log("getting syncstring for '#{filename}'")
    synchronized_string
        project_id    : project_id
        filename      : filename
        sync_interval : 100
        cb            : (err, syncstring) ->
            if err
                actions.report_error("unable to open #{@filename}")
            else
                syncstring.on('sync', actions.sync)
                store.syncstring = actions.syncstring = syncstring
                actions.set_value(syncstring.live())

CodemirrorEditor = (name) -> rclass
    reduxProps :
        "#{name}" :
            value       : rtypes.string
            options     : rtypes.object
            style       : rtypes.object
            scroll_info : rtypes.object
            doc         : rtypes.object
        account :
            editor_settings  : rtypes.object

    propTypes :
        actions     : rtypes.object

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            @cm.off('change', @_cm_change)
            @cm.off('scroll', @_cm_scroll)
            delete @cm

    init_codemirror: (options, style, value) ->
        console.log("init_codemirror", options)
        @_cm_destroy()

        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        @cm = CodeMirror.fromTextArea(node, options)
        if @props.doc?
            @cm.swapDoc(@props.doc)
        if value? and value != @props.doc?.getValue()
            @cm.setValueNoJump(value)
        if style?
            $(@cm.getWrapperElement()).css(style)
        if @props.scroll_info?
            console.log("setting scroll_info to ", @props.scroll_info)
            @cm.scrollTo(@props.scroll_info.left, @props.scroll_info.top)

        @cm.on('change', @_cm_change)
        @cm.on('scroll', @_cm_scroll)
######
        options =
            mode                    : {name:opts.mode, globalVars: true}
            readOnly                : opts.read_only
            lineNumbers             : opts.line_numbers
            firstLineNumber         : opts.first_line_number
            showTrailingSpace       : opts.show_trailing_whitespace
            indentUnit              : opts.indent_unit
            tabSize                 : opts.tab_size
            smartIndent             : opts.smart_indent
            electricChars           : opts.electric_chars
            undoDepth               : opts.undo_depth
            matchBrackets           : opts.match_brackets
            autoCloseBrackets       : opts.auto_close_brackets
            autoCloseTags           : opts.auto_close_xml_tags
            lineWrapping            : opts.line_wrapping
            styleActiveLine         : opts.style_active_line
            indentWithTabs          : not opts.spaces_instead_of_tabs
            showCursorWhenSelecting : true
            extraKeys               : extraKeys
            cursorScrollMargin      : 40
            autofocus               : false

        if opts.match_xml_tags
            options.matchTags = {bothTags: true}

        if opts.code_folding
             extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
             options.foldGutter  = true
             options.gutters     = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]

        if opts.bindings? and opts.bindings != "standard"
            options.keyMap = opts.bindings
            #cursorBlinkRate: 1000

        if opts.theme? and opts.theme != "standard"
            options.theme = opts.theme
######
        cm = CodeMirror.fromTextArea(node, options)
        cm.save = () => @click_save_button()

        if opts.bindings == 'vim'
            # annoying due to api change in vim mode
            cm.setOption("vimMode", true)

    _cm_change: ->
        console.log("_cm_change")
        @_cm_set_value = @cm.getValue()
        @props.actions.set_value(@_cm_set_value)

    _cm_scroll: ->
        @_cm_scroll_info = @cm.getScrollInfo()

    componentDidMount: ->
        console.log("componentDidMount")
        window.c = @
        @init_codemirror(@props.options, @props.style, @props.value)

    componentWillReceiveProps: (newProps) ->
        if not @cm? or not underscore.isEqual(@props.options, newProps.options) or not underscore.isEqual(@props.style, newProps.style)
            @init_codemirror(newProps.options, newProps.style, newProps.value)
        else if newProps.value != @props.value and newProps.value != @_cm_set_value
            @cm?.setValueNoJump(newProps.value)

    componentWillUnmount: ->
        console.log("componentWillUnmount")
        if @cm?
            if @_cm_scroll_info?
                @props.actions?.set_scroll_info(@_cm_scroll_info)
            doc = @cm.getDoc()
            delete doc.cm  # so @cm gets freed from memory when destroyed and doc is not attached to it.
            @props.actions?.set_codemirror_doc(doc)
            @_cm_destroy()

    render_info: ->
        if @props.value?
            <span>Buffer length: {@props.value.length}</span>

    render : ->
        <div>
            <h4>A React/Redux/Codemirror Editor</h4>
            {@render_info()}
            <textarea />
        </div>

render = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    actions = redux.getActions(name)
    CodemirrorEditor_connected = CodemirrorEditor(name)
    <Redux redux={redux} >
        <CodemirrorEditor_connected actions={actions} />
    </Redux>

exports.render = (project_id, filename, dom_node, redux) ->
    console.log("editor_codemirror: render")
    init_redux(redux, project_id, filename)
    React.render(render(redux, project_id, filename), dom_node)

exports.hide = (project_id, filename, dom_node, redux) ->
    console.log("editor_codemirror: hide")
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, filename, dom_node, redux) ->
    console.log("editor_codemirror: show")
    React.render(render(redux, project_id, filename), dom_node)

exports.free = (project_id, filename, dom_node, redux) ->
    console.log("editor_codemirror: free")
    fname = redux_name(project_id, filename)
    store = redux.getStore(fname)
    if not store?
        return
    ReactDOM.unmountComponentAtNode(dom_node)
    store.syncstring?.disconnect_from_session()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(fname)
    redux.removeActions(fname)
