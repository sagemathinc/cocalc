###
Edit description of a single task
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{three_way_merge} = require('smc-util/syncstring')

{debounce} = require('underscore')

{cm_options} = require('../jupyter/cm_options')

misc = require('smc-util/misc')

STYLE =
    width        : '100%'
    overflow     : 'auto'
    marginbottom : '1ex'
    minheight    : '2em'
    padding      : '5px'
    border       : '1px solid #ccc'
    borderRadius : '3px'
    background   : '#fff'

CM_OPTIONS =
    mode              : {name:'gfm2'}
    showTrailingSpace : true
    indentUnit        : 2
    tabSize           : 2
    matchBrackets     : true
    lineWrapping      : true

exports.DescriptionEditor = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        task_id    : rtypes.string.isRequired
        desc       : rtypes.string
        is_current : rtypes.bool
        font_size  : rtypes.number  # used only to cause refresh

    reduxProps :
        account :
            editor_settings : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.task_id    != next.task_id    or \
               @props.desc       != next.desc       or \
               @props.font_size  != next.font_size  or \
               @props.is_current != next.is_current or \
               @props.font_size  != next.font_size

    componentDidMount: ->
        @init_codemirror(@props.desc)

    componentWillReceiveProps: (next) ->
        if not @cm?
            @init_codemirror(next.desc)
            return
        if @props.font_size != next.font_size
            @cm_refresh()
        if @props.desc != next.desc
            @_cm_merge_remote(next.desc)

    cm_refresh: ->
        @cm?.refresh()
        setTimeout((=>@cm?.refresh()), 30)

    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            @_cm_destroy()

    _cm_save: ->
        if not @cm?
            return
        value = @cm.getValue()
        if value == @_cm_last_remote
            # only save if we actually changed something
            return
        @_cm_last_remote = value
        @props.actions.set_desc(@props.task_id, value)

    _cm_merge_remote: (remote) ->
        if not @cm?
            return
        @_cm_last_remote ?= ''
        if @_cm_last_remote == remote
            return  # nothing to do
        local = @cm.getValue()
        new_val = three_way_merge
            base   : @_cm_last_remote
            local  : local
            remote : remote
        @_cm_last_remote = remote
        @cm.setValueNoJump(new_val)

    _cm_undo: ->
        @props.actions.undo()

    _cm_redo: ->
        @props.actions.redo()

    _cm_destroy: ->
        if not @cm?
            return
        delete @_cm_last_remote
        delete @cm.undo
        delete @cm.redo
        $(@cm.getWrapperElement()).remove()  # remove from DOM -- "Remove this from your tree to delete an editor instance."
        delete @cm

    stop_editing: ->
        @_cm_save()
        @props.actions.stop_editing_desc(@props.task_id)
        @props.actions.enable_key_handler()
        return false

    init_codemirror: (value) ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return

        if @props.editor_settings?
            options = cm_options({name:'gfm2'}, @props.editor_settings.toJS())
            misc.merge(options, CM_OPTIONS)
        else
            options = misc.deep_copy(CM_OPTIONS)
        save_to_disk = => @props.actions.save()
        keys =
            "Shift-Enter" : @stop_editing
            Esc           : @stop_editing
            Tab           : => @cm.tab_as_space()
            "Cmd-S"       : save_to_disk
            "Alt-S"       : save_to_disk
            "Ctrl-S"      : save_to_disk
        if options.keyMap == 'vim'
            delete keys.Esc
        options.extraKeys ?= {}
        misc.merge(options.extraKeys, keys)

        @cm = CodeMirror.fromTextArea(node, options)
        $(@cm.getWrapperElement()).css(height:'auto')

        @_cm_last_remote = value
        @cm.setValue(value)

        @_cm_change = debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)
        @cm.on('focus',=> @props.actions.disable_key_handler())

        # NOTE: for vim, we have to deal with trickier vim mode, since editor looses focus
        # when entering colon command... but we do NOT want to stop editing in this case.
        if options.keyMap != 'vim'
            @cm.on('blur', @stop_editing)

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

        if @props.is_current
            @cm?.focus()
        setTimeout((=>@cm_refresh(); if @props.is_current then @cm?.focus()), 0)

    render: ->
        <div style={STYLE}>
            <textarea />
        </div>
