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

$ = window.$

# standard non-SMC libraries
immutable  = require('immutable')
underscore = require('underscore')

# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('./salvus_client')

{synchronized_string} = require('./syncdoc')

# React libraries
{React, ReactDOM, rclass, rtypes, redux, Redux, Actions, Store}  = require('./smc-react')
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
        border : '1px solid grey'
    value : ''
    options : {}

init_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, CodemirrorActions)
    store   = redux.createStore(name, default_store_state)

    console.log("getting syncstring for '#{path}'")
    synchronized_string
        project_id    : project_id
        path      : path
        sync_interval : 100
        cb            : (err, syncstring) ->
            if err
                actions.report_error("unable to open #{@path}")
            else
                syncstring.on('sync', actions.sync)
                store.syncstring = actions.syncstring = syncstring
                actions.set_value(syncstring.live())

    return name

remove_redux(path, redux, project_id) ->
    name = redux_name(project_id, path)
    store = redux.getStore(name)
    if not store?
        return
    store.syncstring?.destroy()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(name)
    redux.removeActions(name)
    return name

CodemirrorEditor = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            value       : rtypes.string
            options     : rtypes.object
            style       : rtypes.object
            scroll_info : rtypes.object
            doc         : rtypes.object

    propTypes :
        actions     : rtypes.object

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            @cm.off('change', @_cm_change)
            @cm.off('scroll', @_cm_scroll)
            delete @cm

    init_codemirror: (options, style, value) ->
        # console.log("init_codemirror", options)
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
            # console.log("setting scroll_info to ", @props.scroll_info)
            @cm.scrollTo(@props.scroll_info.left, @props.scroll_info.top)

        @cm.on('change', @_cm_change)
        @cm.on('scroll', @_cm_scroll)

    _cm_change: ->
        # console.log("_cm_change")
        @_cm_set_value = @cm.getValue()
        @props.actions.set_value(@_cm_set_value)

    _cm_scroll: ->
        @_cm_scroll_info = @cm.getScrollInfo()

    componentDidMount: ->
        #console.log("componentDidMount")
        #window.c = @
        @init_codemirror(@props.options, @props.style, @props.value)

    componentWillReceiveProps: (newProps) ->
        if not @cm? or not underscore.isEqual(@props.options, newProps.options) or not underscore.isEqual(@props.style, newProps.style)
            @init_codemirror(newProps.options, newProps.style, newProps.value)
        else if newProps.value != @props.value and newProps.value != @_cm_set_value
            @cm?.setValueNoJump(newProps.value)

    componentWillUnmount: ->
        # console.log("componentWillUnmount")
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

    render: ->
        <div>
            <h4>A React/Redux/Codemirror Editor</h4>
            {@render_info()}
            <textarea />
        </div>

require('project_file').register_file_editor
    ext         : ['txt', '']
    icon        : 'file-code-o'
    init        : init_redux
    component   : CodemirrorEditor
    remove      : remove_redux
