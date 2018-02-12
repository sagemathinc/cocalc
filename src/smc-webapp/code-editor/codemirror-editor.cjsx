###
Single codemirror-based file editor

This is a wrapper around a single codemirror editor view.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{three_way_merge} = require('smc-util/syncstring')

{throttle} = require('underscore')

SAVE_INTERVAL_MS = 2000

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

exports.CodeEditor = rclass
    propTypes :
        actions : rtypes.object.isRequired

    reduxProps :
        account :
            editor_settings : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.editor_settings != next.editor_settings or \
               @props.font_size       != next.font_size

    componentDidMount: ->
        @init_codemirror()

    componentWillReceiveProps: (next) ->
        if @props.font_size != next.font_size
            @cm_refresh()

    cm_refresh: ->
        @cm?.refresh()
        setTimeout((=>@cm?.refresh()), 30)

    componentWillUnmount: ->
        if @cm?
            @_cm_destroy()

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
        @props.actions.set_cm()

    save_state: ->
        if not @cm?
            return
        @props.actions.set_syncstring_to_codemirror()
        @props.actions.syncstring_save()

    init_codemirror: ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return

        options = @props.editor_settings?.toJS() ? {}
        save_to_disk = => @props.actions.save()
        keys =
            Tab           : => @cm.tab_as_space()
            "Cmd-S"       : save_to_disk
            "Alt-S"       : save_to_disk
            "Ctrl-S"      : save_to_disk

        options.extraKeys ?= {}
        misc.merge(options.extraKeys, keys)

        @cm = CodeMirror.fromTextArea(node, options)
        $(@cm.getWrapperElement()).addClass('smc-vfill')

        @save_state_throttle = throttle(@save_state, SAVE_INTERVAL_MS, {leading:false})

        @cm.on 'change', (instance, changeObj) =>
            if not @cm._setting_from_syncstring
                @_user_action = true
            if changeObj.origin? and changeObj.origin != 'setValue'
                @save_state_throttle()
                @props.actions.exit_undo_mode()

        #@_cm_change = throttle(@_cm_save, 2000, {leading:false})
        #@cm.on('change', @_cm_change)

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

        if @props.is_current
            @cm?.focus()

        setTimeout((=>@cm_refresh(); if @props.is_current then @cm?.focus()), 0)

        @props.actions.set_cm(@cm)

    render: ->
        <div style={STYLE} className='smc-vfill'>
            <textarea />
        </div>
