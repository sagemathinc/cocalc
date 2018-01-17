###
Rendered view of the description of a single task
###

{React, rclass, rtypes}  = require('../smc-react')

{Markdown} = require('../r_misc')

{replace_all_function, parse_hashtags, path_split} = require('smc-util/misc')

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

process_hashtags = (value, selected_hashtags) ->
    # replace hashtags by a span with appropriate class
    v = parse_hashtags(value)
    if v.length == 0
        return value
    # replace hashtags by something that renders nicely in markdown (instead of as descs)
    x0 = [0, 0]
    value0 = ''
    for x in v
        hashtag = value.slice(x[0]+1, x[1])
        state = selected_hashtags?.get(hashtag)
        cls = 'webapp-tasks-hash'
        if state == 1
            cls += '-selected'
        else if state == -1
            cls += '-negated'
        value0 += value.slice(x0[1], x[0]) + "<span class='#{cls}' data-hashtag='#{hashtag}' data-state='#{state}'>#" + hashtag + '</span>'
        x0 = x
    value = value0 + value.slice(x0[1])

process_checkboxes = (value) ->
    value = replace_all_function value, '[ ]', (index) ->
        "<i class='fa fa-square-o'       data-index='#{index}' data-checkbox='false'></i>"
    value = replace_all_function value, '[x]', (index) ->
        "<i class='fa fa-check-square-o' data-index='#{index}' data-checkbox='true'></i>"
    return value

exports.DescriptionRendered = rclass
    propTypes :
        actions           : rtypes.object
        task_id           : rtypes.string
        desc              : rtypes.string
        path              : rtypes.string
        project_id        : rtypes.string
        minimize          : rtypes.bool
        read_only         : rtypes.bool
        selected_hashtags : rtypes.immutable.Map
        search_terms      : rtypes.immutable.Set

    shouldComponentUpdate: (next) ->
        return @props.desc              != next.desc or \
               @props.minimze           != next.minimize or \
               @props.read_only         != next.read_only or \
               @props.selected_hashtags != next.selected_hashtags or \
               @props.search_terms      != next.search_terms

    render_content: ->
        value = @props.desc
        if not value?.trim()
            return <span style={color:'#666'}>Enter a description...</span>
        if @props.minimize
            value = header_part(value)
        value = process_hashtags(value, @props.selected_hashtags)
        if @props.actions?
            value = process_checkboxes(value)
        <Markdown
            value      = {value}
            project_id = {@props.project_id}
            file_path  = {path_split(@props.path).head}
            highlight  = {@props.search_terms}
        />

    on_click: (e) ->
        data = e.target?.dataset
        if not data?
            return
        if data.checkbox?
            e.stopPropagation()
            desc = toggle_checkbox(@props.desc, parseInt(data.index), data.checkbox == 'true')
            @props.actions.set_desc(@props.task_id, desc)
        else if data.hashtag?
            e.stopPropagation()
            state = ({'undefined':undefined, '1':1, '-1':-1})[data.state]  # do not use eval -- safer
            if state == 1 or state == -1  # for now negation doesn't go through clicking
                new_state = undefined
            else
                new_state = 1
            @props.actions.set_hashtag_state(data.hashtag, new_state)

    render: ->
        <div style={paddingTop:'5px'} onClick={if not @props.read_only and @props.actions? then @on_click}>
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