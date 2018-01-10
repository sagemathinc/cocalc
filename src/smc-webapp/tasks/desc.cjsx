###
Task description:

 - displays description as markdown
 - allows for changing it
###

{Button} = require('react-bootstrap')

{React, rclass, rtypes}  = require('../smc-react')

{DescriptionRendered} = require('./desc-rendered')

{DescriptionEditor} = require('./desc-editor')


exports.Description = rclass
    propTypes :
        actions    : rtypes.object
        path       : rtypes.string
        project_id : rtypes.string
        task_id    : rtypes.string.isRequired
        desc       : rtypes.string
        editing    : rtypes.bool
        minimize   : rtypes.bool
        is_current : rtypes.bool
        font_size  : rtypes.number
        read_only  : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.desc     != next.desc     or \
               @props.task_id  != next.task_id  or \
               @props.editing  != next.editing  or \
               @props.minimize != next.minimize or \
               @props.is_current != next.is_current or \
               @props.font_size  != next.font_size  or \
               @props.read_only  != next.read_only

    edit: ->
        @props.actions.edit_desc(@props.task_id)

    stop_editing: ->
        @props.actions.stop_editing_desc(@props.task_id)

    render_editor: ->
        if not @props.editing
            return
        <div>
            <DescriptionEditor
                actions    = {@props.actions}
                task_id    = {@props.task_id}
                desc       = {@props.desc}
                is_current = {@props.is_current}
                font_size  = {@props.font_size}
            />
            <div style={color:'#666', paddingTop: '5px', float: 'right'}>
                Use <a href='https://help.github.com/categories/writing-on-github/' target='_blank'>Markdown</a>, LaTeX and hashtags.
            </div>
        </div>

    render_close_button: ->
        if not @props.editing
            return
        <Button onClick={@stop_editing}>
            Close
        </Button>

    render_desc: ->
        <DescriptionRendered
            actions    = {@props.actions}
            task_id    = {@props.task_id}
            path       = {@props.path}
            project_id = {@props.project_id}
            desc       = {@props.desc}
            minimize   = {@props.minimize}
            read_only  = {@props.read_only}
            />

    render: ->
        if @props.read_only or not @props.actions?
            return @render_desc()
        <div>
            {@render_editor()}
            {@render_close_button()}
            <div onClick={@edit}>
                {@render_desc()}
            </div>
        </div>
