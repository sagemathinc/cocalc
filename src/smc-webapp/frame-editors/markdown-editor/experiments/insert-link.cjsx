#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
React component for inserting a link

Basically done-ish, but not using since I already have this and related commands
as CodeMirror plugins, and will use those for first release, since we only support
codemirror initially for editing.
###

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes} = require('smc-webapp/app-framework')
{Icon, Space}           = require('smc-webapp/r_misc')
{Button, Col,  ControlLabel,
 Form, FormControl, FormGroup, Well}  = require('react-bootstrap')

exports.InsertLink = rclass
    propTypes :
        set       : rtypes.func.isRequired
        on_submit : rtypes.func.isRequired
        store     : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next, state) ->
        return @props.store != next.store or misc.is_different(@state, state, ['url', 'text', 'title'])

    componentWillUnmount: ->
        if not @_done
            @save()

    getInitialState: ->
        url   : @props.store.get('url')   ? ''
        text  : @props.store.get('text')  ? ''
        title : @props.store.get('title') ? ''

    set: (field, value) ->
        @props.set(@props.store.set(field, value))

    save: ->
        @props.set(@state)

    render_url: ->
        <FormGroup controlId="form-url">
            <Col componentClass={ControlLabel} sm={4}>
                URL (target of link)
            </Col>
            <Col sm={8}>
                <FormControl type="text" placeholder="URL" ref='url' value={@state.url} onChange={(e) => @setState(url:e.target.value)}/>
            </Col>
        </FormGroup>

    render_displayed_text: ->
        <FormGroup controlId="form-text">
            <Col componentClass={ControlLabel} sm={4}>
                Displayed Text (optional)
            </Col>
            <Col sm={8}>
                <FormControl type="text" placeholder="Displayed text" ref='text'
                     value={@state.text} onChange={(e) => @setState(text:e.target.value)}/>
            </Col>
        </FormGroup>

    render_title: ->
        <FormGroup controlId="form-title">
            <Col componentClass={ControlLabel} sm={4}>
                Title (optional)
            </Col>
            <Col sm={8}>
                <FormControl type="text" placeholder="Title" ref='title'
                    value={@state.title} onChange={(e) => @setState(title:e.target.value)}
                />
            </Col>
        </FormGroup>

    render_buttons: ->
        <FormGroup controlId="form-buttons">
            <Col smOffset={2} sm={10}>
                <Button
                    onClick = {=> @save(true); @_done=true; @props.on_submit()}
                >
                    Create Link
                </Button>
                <Space />
                <Button
                    onClick = {=>@_done=true; @props.set()}
                >
                    Cancel
                </Button>
            </Col>
        </FormGroup>

    render_preview: ->
        text = @state.text
        if not text
            text = @state.url
        if not text
            text = 'test link'
        <div>
            <a
                href   = {@state.url}
                title  = {@state.title}
                target = {"_blank"}
            >
                {text}
            </a>
        </div>

    render: ->
        <Well
                style = {margin: 'auto', width: '70%', marginTop: '10px', marginBottom:'10px'}
        >
            <Form
                horizontal = {true}
            >
                {@render_url()}
                {@render_displayed_text()}
                {@render_title()}
                {@render_buttons()}
                {@render_preview()}
            </Form>
        </Well>