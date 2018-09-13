###
Utility/parsing functions used in rendering task description.
###

{replace_all_function, parse_hashtags} = require('smc-util/misc')
{apply_without_math} = require('smc-util/mathjax-utils-2')

# Make clever use of replace_all_function to toggle the state of a checkbox.
exports.toggle_checkbox = (string, index, checked) ->
    # Find the index'd checkbox and change the state to not checked.
    if checked
        cur  = '[x]'
        next = '[ ]'
    else
        cur  = '[ ]'
        next = '[x]'

    return apply_without_math string, (x) ->
        return replace_all_function(x, cur, (i) -> if i == index then next else cur)

# assumes value is the text output by remove_math!
exports.process_hashtags = (value, selected_hashtags) ->
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

# assumes value is the text output by remove_math!
exports.process_checkboxes = (value) ->
    value = replace_all_function value, '[ ]', (index) ->
        "<i class='fa fa-square-o'       data-index='#{index}' data-checkbox='false'></i>"
    value = replace_all_function value, '[x]', (index) ->
        "<i class='fa fa-check-square-o' data-index='#{index}' data-checkbox='true'></i>"
    return value

exports.header_part = (s) ->
    lines = s.trim().split('\n')
    for i in [0...lines.length]
        if lines[i].trim() == ''
            if i == lines.length - 1
                return s
            else
                return lines.slice(0,i).join('\n')
    return s