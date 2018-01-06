###
Rendered view of the description of a single task
###

{React, rclass, rtypes}  = require('../smc-react')

{Markdown} = require('../r_misc')

{replace_all_function, path_split} = require('smc-util/misc')

# Make clever use of replace_all_function to toggle the state of a checkbox.
toggle_checkbox = (string, index, checked) ->
    # Find the index'd checkbox and change the state to not checked.
    if checked
        cur  = '[x]'
        next = '[ ]'
    else
        cur  = '[ ]'
        next = '[x]'
    return replace_all_function(string, cur, (i) -> if i == index then next else cur)

exports.DescriptionRendered = rclass
    propTypes :
        actions    : rtypes.object
        task_id    : rtypes.string
        desc       : rtypes.string
        path       : rtypes.string
        project_id : rtypes.string
        minimize   : rtypes.bool
        read_only  : rtypes.bool

    render_content: ->
        value = @props.desc
        if not value?.trim()
            return <span style={color:'#666'}>Enter a description...</span>
        if @props.minimize
            value = header_part(value)
        if @props.actions?
            value = replace_all_function value, '[ ]', (index) ->
                "<i class='fa fa-square-o'       data-index='#{index}' data-checked='false' data-type='checkbox'></i>"
            value = replace_all_function value, '[x]', (index) ->
                "<i class='fa fa-check-square-o' data-index='#{index}' data-checked='true' data-type='checkbox'></i>"
        <Markdown
            value      = {value}
            project_id = {@props.project_id}
            file_path  = {path_split(@props.path).head}
        />

    on_click: (e) ->
        data = e.target?.dataset
        if data?.type != 'checkbox'
            return
        e.stopPropagation()
        desc = toggle_checkbox(@props.desc, parseInt(data.index), data.checked == 'true')
        @props.actions.set_desc(@props.task_id, desc)

    render: ->
        <div style={padding:'0 10px'} onClick={if not @props.read_only and @props.actions? then @on_click}>
            {@render_content()}
        </div>


header_part = (s) ->
    lines = s.trim().split('\n')
    for i in [0...lines.length]
        if lines[i].trim() == ''
            if i == lines.length - 1
                return s
            else
                return lines.slice(0,i).join('\n')
    return s