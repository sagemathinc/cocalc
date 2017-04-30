###
Raw editable view of .ipynb file json, including metadata.

WARNING:  There are many similarities between the code in this file and in
the file codemirror-editor.cjsx, and also many differences.  Part of the
subtlely comes from editing JSON, but not saving when state is invalid.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')

{Loading} = require('../r_misc')

json_stable = require('json-stable-stringify')
syncstring  = require('smc-util/syncstring')
immutable   = require('immutable')
underscore  = require('underscore')

{cm_options} = require('./cm_options')

exports.RawEditor = rclass
    propTypes:
        actions    : rtypes.object.isRequired
        font_size  : rtypes.number
        raw_editor : rtypes.immutable.Map   # redux state

        cells      : rtypes.immutable.Map   # ipynb object depends on this
        kernel     : rtypes.string          # ipynb object depends on this, too
        metadata   : rtypes.immutable.Map   # ipynb object depends on this

    reduxProps :
        account :
            editor_settings : rtypes.immutable.Map

    render_desc: ->
        s = "This is an editable view IPynb notebook's underlying .ipynb file "
        s += " (images are replaced by sha1 hashes)."
        <div style={color:"#666", fontSize: '12pt', marginBottom: '15px'}>
            {s}
        </div>

    render_editor: ->
        ipynb = @props.actions.store.get_ipynb()
        if not ipynb?
            return
        json = json_stable(ipynb, {space:1})
        editor_settings = @props.editor_settings?.toJS()
        editor_settings.code_folding = true  # critical for json
        options = cm_options({name:'application/json'}, editor_settings, editor_settings.line_numbers)
        options.indentUnit = options.tabSize = 1
        options.indentWithTabs = false
        <CodeMirrorEditor
            actions    = {@props.actions}
            options    = {immutable.fromJS(options)}
            value      = {json}
            font_size  = {@props.font_size}
            raw_editor = {@props.raw_editor}
        />

    render: ->
        style =
            fontSize        : "#{@props.font_size}px"
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'
            overflowX       : 'hidden'

        viewer_style =
            backgroundColor : '#fff'
            boxShadow       : '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'
            height          : '100%'

        data = @props.actions.store.get_ipynb()
        if not data?
            return <Loading />
        <div style={style}>
            <div style={viewer_style}>
                {@render_editor()}
            </div>
        </div>

ERROR_STYLE =
    color        : 'white'
    background   : 'red'
    padding      : "5px"
    position     : 'absolute'
    zIndex       : '5'
    width        : '50%'
    right        : '0'
    borderRadius : '3px'
    boxShadow    : '0px 0px 3px 2px rgba(87, 87, 87, 0.2)'

CodeMirrorEditor = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        options    : rtypes.immutable.Map.isRequired
        value      : rtypes.string.isRequired
        font_size  : rtypes.number   # font_size not explicitly used, but it is critical
                                    # to re-render on change so Codemirror recomputes itself!
        raw_editor : rtypes.immutable.Map

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    setReduxState: (obj) ->
        x = @props.raw_editor ? immutable.Map()
        for k, v of obj
            if not v?
                x = x.delete(k)
            else
                x = x.set(k, immutable.fromJS(v))
        if not x.equals(@props.raw_editor)
            @props.actions.setState(raw_editor: x)

    _cm_destroy: ->
        if @cm?
            $(@cm.getWrapperElement()).remove()  # remove from DOM
            delete @cm

    _cm_save: ->
        if not @cm? or not @props.actions?
            return
        value = @cm.getValue()
        if value != @_cm_last_remote
            try
                ipynb = JSON.parse(value)
            catch error
                @setReduxState(error : "#{error}")
                return
            @props.actions.set_to_ipynb(ipynb)
            @_cm_last_remote = value
        # Things are good -- clear error state if it is set
        if @props.raw_editor?.get('error')
            @setReduxState(error : undefined)
        return value

    _cm_merge_remote: (remote) ->
        if not @cm?
            return
        @_cm_last_remote ?= ''
        if @_cm_last_remote == remote
            return  # nothing to do
        local = @cm.getValue()
        new_val = syncstring.three_way_merge
            base   : @_cm_last_remote
            local  : local
            remote : remote
        @_cm_last_remote = remote
        @cm.setValueNoJump(new_val)

    _cm_undo: ->
        if not @cm? or not @props.actions?
            return
        if not @props.actions.syncdb.in_undo_mode() or @cm.getValue() != @_cm_last_remote
            if not @_cm_save()?  # failed to save
                return
        @props.actions.undo()

    _cm_redo: ->
        if not @cm? or not @props.actions?
            return
        @props.actions.redo()

    update_codemirror_options: (next, current) ->
        next.forEach (value, option) =>
            if value != current.get(option)
                value = value?.toJS?() ? value
                @cm.setOption(option, value)
            return

    init_codemirror: (options, value) ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return
        options0 = options.toJS()

        options0.foldGutter = true
        options0.extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
        options0.extraKeys["Tab"] = (cm) -> cm.tab_as_space()
        options0.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]

        @cm = CodeMirror.fromTextArea(node, options0)
        $(@cm.getWrapperElement()).css(height:'100%')

        @_cm_last_remote = value
        @cm.setValue(value)

        @_cm_change = underscore.debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)
        # replace undo/redo by our multi-user sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    componentWillReceiveProps: (next) ->
        if not @cm?
            @init_codemirror(next.options, next.value)
            return
        if not @props.options.equals(next.options)
            @update_codemirror_options(next.options, @props.options)
        if @props.font_size != next.font_size
            @cm.refresh()
        if next.value != @props.value
            @_cm_merge_remote(next.value)

    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            @_cm_destroy()

    render_error: ->
        error = @props.raw_editor?.get('error')
        if error
            <div style={ERROR_STYLE}>
                ERROR: {error}
            </div>

    render : ->
        <div style={width:'100%', overflow:'auto', height:'100%', position:'relative'}>
            {@render_error()}
            <textarea />
        </div>

