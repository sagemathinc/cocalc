#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{Button, ButtonGroup} = require('react-bootstrap')

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./app-framework')
{webapp_client} = require('./webapp_client')
{Icon} = require('./r_misc')

PublicPDF = rclass
    displayName : "PublicPDF"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    componentDidMount: ->
        @refresh()
        window.addEventListener('resize', @refresh)

    componentDidUpdate: ->
        @refresh()

    componentWillUnmount: ->
        window.removeEventListener('resize', @refresh)
        @refresh(false)

    refresh: (show=true) ->
        elt = ReactDOM.findDOMNode(@refs.elt)
        refresh_iframe(@props.project_id, @props.path, elt, show)

    reload: ->
        delete_iframe(@props.project_id, @props.path)
        create_iframe(@props.project_id, @props.path)
        @refresh(true)

    render: ->
        <div className="smc-vfill">
            <ButtonGroup>
                <Button onClick={@reload} >
                    <Icon name="refresh" /> Reload
                </Button>
                <Button
                    target="_blank" rel="noopener"
                    href="#{get_url(@props.project_id, @props.path)}?random=#{Math.random()}">
                    <Icon name="external-link"/> Open in New Window
                </Button>
            </ButtonGroup>
            <div
                ref   = 'elt'
                style = {overflowY: 'hidden', flex:1, display:'flex'}>
            </div>
        </div>

key = (project_id, path) -> project_id + path

iframes = {}

last_visible_key = undefined
refresh_iframe = (project_id, path, elt, show) ->
    elt = $(elt)

    if last_visible_key?
        # See https://github.com/sagemathinc/cocalc/issues/1322
        # React optimizes things and doesn't unmount the component when switching
        # between two editors both display PDF's, so componentWillUnmount isn't called
        # (instead the PDF viewer is mutated from one to the other!).
        iframes[last_visible_key]?.hide()
        last_visible_key = undefined

    k = key(project_id, path)
    iframe = iframes[k]
    if not iframe?
        return
    if show
        iframe.show()
        iframe.exactly_cover(elt)
        last_visible_key = k
    else
        iframe.hide()

get_url = (project_id, path) ->
    return webapp_client.project_client.read_file({project_id:project_id, path:path})

create_iframe = (project_id, path) ->
    src = get_url(project_id, path)
    frame = $("<iframe style='position:absolute' src=#{src} frameborder=0 scrolling=no>").hide()
    iframes[key(project_id, path)] = frame
    $("body").append(frame)
    return

delete_iframe = (project_id, path) ->
    k = key(project_id, path)
    iframes[k].remove()
    delete iframes[k]

# DIsabled in favor of new frame editor.
###
for pub in [true, false]
    require('./project_file').register_file_editor
        ext       : 'pdf'
        icon      : 'file-pdf-o'
        is_public : pub
        component : PublicPDF
        # In the init we create the hidden iframe.
        init      : (path, redux, project_id) ->
            create_iframe(project_id, path)
            return undefined
        remove    : (path, redux, project_id) ->
            delete_iframe(project_id, path)

###
