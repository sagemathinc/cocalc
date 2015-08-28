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
immutable = require('immutable')
underscore = require('underscore')

# SMC libraries
misc = require('misc')
{defaults, required} = misc
{salvus_client} = require('salvus_client')

{synchronized_string} = require('syncdoc')

# React libraries
{React, rclass, rtypes, Flux, Actions, Store}  = require('flux')
{Loading} = require('r_misc')
{Input} = require('react-bootstrap')

flux_name = exports.flux_name = (project_id, filename) ->
    return "editor-#{project_id}-#{filename}"

class CodemirrorActions extends Actions
    set_state: (payload) => payload

    report_error: (mesg) =>
        @set_state(error:mesg)

    sync: =>
        console.log('sync')
        @set_value(@syncstring.live())

    set_style: (style) =>
        @set_state
            style: misc.merge(style, @flux.getStore(@name).state.style)

    set_value: (value) =>
        if @flux.getStore(@name).state.value != value
            @set_state(value: value)
            @syncstring.live(value)
            @syncstring.sync()

    set_scroll_info: (scroll_info) =>
        @set_state(scroll_info: scroll_info)

    # This is used to save the state of the document (scroll positions, etc.)
    # This does *NOT* change the document to have this doc.
    set_codemirror_doc: (doc) =>
        @set_state(doc : doc)

class CodemirrorStore extends Store
    _init: (flux) =>
        ActionIds = flux.getActionIds(@name)
        @register(ActionIds.set_state, @setState)
        @state =
            style :
                border : '1px solid grey'
            value : ''
            options : {}

exports.init_flux = init_flux = (flux, project_id, filename) ->
    name = flux_name(project_id, filename)
    console.log("store=require('flux').flux.getStore('#{name}');actions=require('flux').flux.getActions('#{name}');")
    if flux.getActions(name)?
        return  # already initialized
    actions = flux.createActions(name, CodemirrorActions)
    store   = flux.createStore(name, CodemirrorStore)
    store._init(flux)

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

CodemirrorEditor = rclass
    propTypes :
        value       : rtypes.string
        actions     : rtypes.object
        options     : rtypes.object
        style       : rtypes.object
        doc         : rtypes.object
        scroll_info : rtypes.object

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            @cm.off('change', @_cm_change)
            @cm.off('scroll', @_cm_scroll)
            delete @cm

    init_codemirror: (options, style, value) ->
        console.log("init_codemirror", options)
        @_cm_destroy()

        node = $(React.findDOMNode(@)).find("textarea")[0]
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
            <h4>A React/Flux/Codemirror Editor</h4>
            {@render_info()}
            <textarea />
        </div>

render = (flux, project_id, filename) ->
    name = flux_name(project_id, filename)
    connect_to =
        value       : name
        options     : name
        style       : name
        scroll_info : name
        doc         : name
    actions = flux.getActions(name)
    <Flux flux={flux} connect_to={connect_to} >
        <CodemirrorEditor actions={actions} />
    </Flux>

exports.render = (project_id, filename, dom_node, flux) ->
    console.log("editor_codemirror: render")
    init_flux(flux, project_id, filename)
    React.render(render(flux, project_id, filename), dom_node)

exports.hide = (project_id, filename, dom_node, flux) ->
    console.log("editor_codemirror: hide")
    React.unmountComponentAtNode(dom_node)

exports.show = (project_id, filename, dom_node, flux) ->
    console.log("editor_codemirror: show")
    React.render(render(flux, project_id, filename), dom_node)

exports.free = (project_id, filename, dom_node, flux) ->
    console.log("editor_codemirror: free")
    fname = flux_name(project_id, filename)
    store = flux.getStore(fname)
    if not store?
        return
    React.unmountComponentAtNode(dom_node)
    store.syncstring?.disconnect_from_session()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    flux.removeStore(fname)
    flux.removeActions(fname)


