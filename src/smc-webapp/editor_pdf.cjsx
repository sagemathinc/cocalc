###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX
# and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
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

{Button, ButtonGroup} = require('react-bootstrap')

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{salvus_client} = require('./salvus_client')
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
                    target="_blank"
                    href="#{get_url(@props.project_id, @props.path)}?random=#{Math.random()}">
                    <Icon name="external-link"/> Open in new window
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
        # See https://github.com/sagemathinc/smc/issues/1322
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
    return salvus_client.read_file_from_project({project_id:project_id, path:path})

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


