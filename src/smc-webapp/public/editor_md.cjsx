###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
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

# React libraries
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('../smc-react')

{ErrorDisplay, Loading, Markdown} = require('../r_misc')

{salvus_client} = require('../salvus_client')

redux_name = (project_id, path) -> "editor-#{project_id}-#{path}"

PublicMarkdown = rclass ({name}) ->
    displayName : "PublicMarkdown"

    reduxProps :
        "#{name}" :
            content    : rtypes.string
            project_id : rtypes.string
            path       : rtypes.string

    render: ->
        if @props.error
            <ErrorDisplay error={@props.error}/>
        else if not @props.content?
            <Loading />
        else
            <div className="salvus-editor-static-html-content">
                <Markdown project_id={@props.project_id} path={@props.path} value={@props.content} />
            </div>

class MDActions extends Actions
    load_content: (project_id, path) =>
        @setState(project_id:project_id, path:path)
        salvus_client.public_get_text_file
            project_id : project_id
            path       : path
            timeout    : 60
            cb         : (err, content) =>
                if err
                    @setState(error: err)
                else
                    @setState(content: content)

require('../project_file').register_file_editor
    ext       : 'md'
    is_public : true
    icon      : 'file-code-o'

    init: (path, redux, project_id) ->
        name = redux_name(project_id, path)
        if redux.getActions(name)?
            return name
        actions = redux.createActions(name, MDActions)
        store   = redux.createStore(name)
        actions.load_content(project_id, path)  # start loading
        return name

    component : PublicMarkdown

    remove: (path, redux, project_id) ->
        name = redux_name(project_id, path)
        redux.removeStore(name)
        redux.removeActions(name)


