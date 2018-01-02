###
Hashtag bar for selecting which tasks are shown by tags
###

{Button, ButtonGroup} = require('react-bootstrap')

{React, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')

Hashtag = rclass
    propTypes :
        actions : rtypes.object.isRequired
        visible : rtypes.bool.isRequired
        tag     : rtypes.string.isRequired
        state   : rtypes.number              # 1=selected, -1=negated, undefined = not selected

    shouldComponentUpdate: (next) ->
        return @props.tag != next.tag or @props.state != next.state or @props.visible != next.visible

    click: ->
        switch @props.state
            when 1
                @props.actions.set_hashtag_state(@props.tag, -1)
            when -1
                @props.actions.set_hashtag_state(@props.tag)
            else
                @props.actions.set_hashtag_state(@props.tag, 1)

    render: ->
        switch @props.state
            when 1
                bsStyle = 'warning'
            when -1
                bsStyle = 'danger'
            else
                bsStyle = 'info'
        disabled = not @props.state? and not @props.visible  # only disable if nothing visible for that tag and NOT selected or negated
        <Button onClick={@click} disabled={disabled} bsStyle={bsStyle} style={fontSize:'9pt'}>
            #{@props.tag}
        </Button>

exports.HashtagBar = rclass
    propTypes :
        actions  : rtypes.object.isRequired
        hashtags : rtypes.immutable.Map.isRequired
        selected : rtypes.immutable.Map              # immutable map from hashtag string to 1=selected, -1=negated

    shouldComponentUpdate: (next) ->
        return @props.hashtags != next.hashtags or @props.selected != next.selected

    render_hashtag: (tag, val) ->
        <Hashtag
            key     = {tag}
            actions = {@props.actions}
            tag     = {tag}
            visible = {val == 1}
            state   = {@props.selected?.get(tag)}
            />

    render_hashtags: ->
        v = []
        @props.hashtags.forEach (val, tag) =>
            v.push([tag, @render_hashtag(tag, val)])
            return
        v.sort (a,b) -> misc.cmp(a[0], b[0])
        return (x[1] for x in v)

    render: ->
        <ButtonGroup>
            {@render_hashtags()}
        </ButtonGroup>