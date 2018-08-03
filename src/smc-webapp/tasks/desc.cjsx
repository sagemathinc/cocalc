###
Task description:

 - displays description as markdown
 - allows for changing it
###

{Button} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, rclass, rtypes}  = require('../app-framework')

{DescriptionRendered} = require('./desc-rendered')

{DescriptionEditor} = require('./desc-editor')


exports.Description = rclass
    propTypes :
        actions           : rtypes.object
        path              : rtypes.string
        project_id        : rtypes.string
        task_id           : rtypes.string.isRequired
        desc              : rtypes.string
        editing           : rtypes.bool
        full_desc         : rtypes.bool
        is_current        : rtypes.bool
        font_size         : rtypes.number
        read_only         : rtypes.bool
        selected_hashtags : rtypes.immutable.Map
        search_terms      : rtypes.immutable.Set

    shouldComponentUpdate: (next) ->
        return @props.desc              != next.desc     or \
               @props.task_id           != next.task_id  or \
               @props.editing           != next.editing  or \
               @props.full_desc         != next.full_desc or \
               @props.is_current        != next.is_current or \
               @props.font_size         != next.font_size  or \
               @props.read_only         != next.read_only  or \
               @props.search_terms      != next.search_terms or \
               @props.selected_hashtags != next.selected_hashtags

    edit: ->
        @props.actions.edit_desc(@props.task_id)

    render_editor: ->
        if not @props.editing
            return
        <div>
            <DescriptionEditor
                actions           = {@props.actions}
                task_id           = {@props.task_id}
                desc              = {@props.desc}
                is_current        = {@props.is_current}
                font_size         = {@props.font_size}
                selected_hashtags = {@props.selected_hashtags}
                search_terms      = {@props.search_terms}
            />
            <div style={color:'#666', padding: '5px 0', float: 'right'}>
                Use <a href='https://help.github.com/categories/writing-on-github/' target='_blank'>Markdown</a>, LaTeX and #hashtags. Shift+Enter to close.  Double click to edit.
            </div>
        </div>

    render_desc: ->
        if @props.editing
            return
        <div
            onDoubleClick = {@edit}
            onClick       = {if not @props.desc then @edit}
            >
            <DescriptionRendered
                actions           = {@props.actions}
                task_id           = {@props.task_id}
                path              = {@props.path}
                project_id        = {@props.project_id}
                desc              = {@props.desc}
                full_desc         = {@props.full_desc or @props.is_current}
                read_only         = {@props.read_only}
                selected_hashtags = {@props.selected_hashtags}
                search_terms      = {@props.search_terms}
                />
        </div>

    render_edit_button: ->
        if not @props.is_current or @props.editing
            return
        <Button
            onClick = {@edit} 
            style   = {marginBottom:'5px'}
            title   = {'Edit this task (click or enter key)'}
        >
            <Icon name={'edit'} /> Edit
        </Button>

    render: ->
        if @props.read_only or not @props.actions?
            return @render_desc()
        <div>
            {@render_editor()}
            {@render_desc()}
            {@render_edit_button()}
        </div>
