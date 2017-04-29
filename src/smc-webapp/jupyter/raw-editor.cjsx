###
Raw editable view of .ipynb file json, including metadata.
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
        actions   : rtypes.object.isRequired
        font_size : rtypes.number
        cells     : rtypes.immutable.Map   # ipynb object depends on this
        kernel    : rtypes.string          # ipynb object depends on this, too

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
            options = {immutable.fromJS(options)}
            value   = {json}
            font_size = {@props.font_size}
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

CodeMirrorEditor = rclass
    propTypes :
        options   : rtypes.immutable.Map.isRequired
        value     : rtypes.string.isRequired
        font_size : rtypes.number   # font_size not explicitly used, but it is critical
                                           # to re-render on change so Codemirror recomputes itself!

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    _cm_destroy: ->
        if @cm?
            $(@cm.getWrapperElement()).remove()  # remove from DOM
            delete @cm

    _cm_save: ->
        if not @cm?
            return
        value = @cm.getValue()
        #if value != @_cm_last_remote
            # only save if we actually changed something
            #@_cm_last_remote = value
            ## TODO: save here?
        return value

    _cm_merge_remote: (remote) ->
        if not @cm?
            return
        if @_cm_last_remote?
            if @_cm_last_remote == remote
                return  # nothing to do
            local = @cm.getValue()
            new_val = syncstring.three_way_merge
                base   : @_cm_last_remote
                local  : local
                remote : remote
            console.log "'#{@_cm_last_remote}'", "'#{local}'", "'#{remote}'", "'#{new_val}'"
        else
            new_val = remote
        @_cm_last_remote = remote
        @cm.setValueNoJump(new_val)

    _cm_undo: ->

    _cm_redo: ->

    init_codemirror: (options, value) ->
        current_value = @cm?.getValue()
        @_cm_destroy()
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

        if current_value?
            # restore value and merge in new if changed
            @cm.setValue(current_value)
            @_cm_merge_remote(value)
        else
            # setting for first time
            @cm.setValue(value)

        @_cm_change = underscore.debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    componentWillReceiveProps: (next) ->
        if not @cm? or not @props.options.equals(next.options) or \
                @props.font_size != next.font_size
            @init_codemirror(next.options, next.value)
            return
        if next.value != @props.value
            @_cm_merge_remote(next.value)

    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            @_cm_destroy()

    render : ->
        <div style={width:'100%', overflow:'auto', height:'100%'}>
            <textarea />
        </div>

