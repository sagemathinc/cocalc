###
A JSON Editor

This is just built using codemirror for now.
###

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

json_stable = require('json-stable-stringify')
syncstring  = require('smc-util/syncstring')
immutable   = require('immutable')
underscore  = require('underscore')

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

exports.JSONEditor = rclass
    propTypes :
        value      : rtypes.immutable.Map.isRequired  # must be immutable all the way and JSON-able...
        font_size  : rtypes.number             # font_size not explicitly used, but it is critical
                                               # to re-render on change so Codemirror recomputes itself!
        on_change  : rtypes.func.isRequired    # on_change(obj) -- called with JSON-able object
        cm_options : rtypes.immutable.Map.isRequired
        undo       : rtypes.func
        redo       : rtypes.func

    shouldComponentUpdate: (nextProps, nextState) ->
        return @props.font_size  != nextProps.font_size or \
               not @props.value.equals(nextProps.value) or \
               @props.cm_options != nextProps.cm_options or \
               @state.error      != nextState.error

    componentDidMount: ->
        @init_codemirror()

    getInitialState: ->
        error : undefined

    _cm_destroy: ->
        if not @cm?
            return
        $(@cm.getWrapperElement()).remove()  # remove from DOM
        delete @cm

    _cm_save: ->
        if not @cm?
            return
        value = @cm.getValue()
        if value == @_cm_last_save
            return value
        try
            obj = JSON.parse(value)
        catch error
            @setState(error : "#{error}")
            return
        @_cm_last_save = value
        @props.on_change(obj)
        @clear_error()
        return value

    clear_error: ->
        if @state.error
            @setState(error : undefined)

    _cm_merge_remote: (remote) ->
        if not @cm?
            return
        local = @cm.getValue()
        remote = @to_json(remote)
        if local != @_cm_last_save
            # merge in our local changes
            local_changes = syncstring.make_patch(@_cm_last_save, local)
            new_val = syncstring.apply_patch(local_changes, remote)[0]
        else
            # just set to remote value
            @_cm_last_save = new_val = remote
            @clear_error()
        @cm.setValueNoJump(new_val)

    _cm_undo: ->
        if not @cm?
            return
        if @_cm_save()
            @props.undo?()

    _cm_redo: ->
        if not @cm?
            return
        @props.redo?()

    update_codemirror_options: (next, current) ->
        if not @cm?
            return
        next_options = @options(next)
        next.forEach (value, option) =>
            if value != current.get(option)
                value = value?.toJS?() ? value
                @cm.setOption(option, next_options[option])
            return

    options: (cm_options) ->
        options = cm_options.toJS()
        options.mode = {name:'application/json'}
        options.indentUnit = options.tabSize = 1
        options.indentWithTabs = false
        options.foldGutter = true
        options.extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
        options.extraKeys["Tab"] = (cm) -> cm.tab_as_space()
        options.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
        return options

    to_json: (obj) ->
        if immutable.Map.isMap(obj)
            obj = obj.toJS()
        return json_stable(obj, {space:1})

    init_codemirror: ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]

        @cm = CodeMirror.fromTextArea(node, @options(@props.cm_options))

        $(@cm.getWrapperElement()).css(height:'100%')

        @_cm_last_save = @to_json(@props.value)
        @cm.setValue(@_cm_last_save)

        save = underscore.debounce(@_cm_save, 3000)
        @cm.on 'change', (instance, changeObj) ->
            if changeObj.origin != 'setValue'
                save()
        # replace undo/redo by our multi-user sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

    componentWillReceiveProps: (next) ->
        if not @props.cm_options.equals(next.cm_options)
            @update_codemirror_options(next.cm_options, @props.cm_options)
        if @props.font_size != next.font_size
            @cm?.refresh()
        if not next.value.equals(@props.value)
            @_cm_merge_remote(next.value)

    componentWillUnmount: ->
        if not @cm?
            return
        @_cm_save()
        @_cm_destroy()

    render_error: ->
        if not @state.error
            return
        <div style={ERROR_STYLE}>
            ERROR: {@state.error}
        </div>

    render : ->
        <div style={width:'100%', overflow:'auto', height:'100%', position:'relative'}>
            {@render_error()}
            <textarea />
        </div>

