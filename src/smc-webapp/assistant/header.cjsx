#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# global libs
_         = require('underscore')
immutable = require('immutable')
# react elements
{Col, Row, Panel, Button, FormGroup, Checkbox, FormControl, Well, Alert, Modal, Table, Nav, NavItem, ListGroup, ListGroupItem, InputGroup} = require('react-bootstrap')
{React, ReactDOM, redux, Redux, Actions, Store, rtypes, rclass} = require('../app-framework')
{Loading, Icon, Markdown, Space, SearchInput} = require('../r_misc')
# cocalc libs
{defaults, required, optional} = misc = require('smc-util/misc')
{ICON_NAME} = require('./common')

# The top part of the dialog. Shows the Title (maybe with the Language), a selector for the language, and search
outer_style =
    display        : 'flex'
    flexWrap       : 'nowrap'
    justifyContent : 'space-between'

inner_style =
    marginLeft  : '10px'
    marginRight : '10px'

# this is similar to Object.assign, but compatible with IE
title_style  = _.defaults({flex: '0 0 auto'}, inner_style)
nav_style    = _.defaults({flex: '1 0 auto'}, inner_style)
search_style = _.defaults({flex: '0 1 auto', marginRight: '50px'}, inner_style)

exports.ExamplesHeader = rclass
    displayName : 'ExamplesHeader'

    propTypes:
        actions      : rtypes.object
        nav_entries  : rtypes.arrayOf(rtypes.string)
        search_str   : rtypes.string
        lang         : rtypes.string
        lang_select  : rtypes.bool
        unknown_lang : rtypes.bool

    getDefaultProps: ->
        search_str : ''

    shouldComponentUpdate: (props, state) ->
        update = misc.is_different(@props, props, ['lang', 'search_str', 'search_sel', 'unknown_lang'])
        update or= misc.is_different_array(props.nav_entries, @props.nav_entries)
        return update

    langSelect: (key) ->
        @props.actions.select_lang(key)

    search: (value) ->
        @props.actions.search(value)

    # a horizontal list of clickable language categories
    render_nav: ->
        entries = @props.nav_entries ? []

        <Nav
            bsStyle   = {'pills'}
            style     = {marginLeft:'10px'}
            activeKey = {@props.lang}
            ref       = {'lang'}
            onSelect  = {@langSelect}
        >
            {
                entries.map (key, idx) ->
                    name    = misc.jupyter_language_to_name(key)
                    <NavItem
                        key      = {idx}
                        eventKey = {key}
                        title    = {name}
                    >
                        {name}
                    </NavItem>
            }
        </Nav>

    render_search: ->
        <SearchInput
            placeholder = {'Search'}
            value       = {@props.search_str ? ''}
            on_escape   = {=>@props.actions.search('')}
            on_change   = {@search}
            on_up       = {=>@props.actions.search_cursor(-1)}
            on_down     = {=>@props.actions.search_cursor(+1)}
            input_class = {'webapp-examples-search'}
        />

    render: ->
        return null if (not @props.lang?) or (not @props.lang_select?)
        show_lang_nav = @props.lang_select and not @props.unknown_lang

        <div style={outer_style}>
            <div style={title_style}>
                <h2>
                    <Icon name={ICON_NAME} />
                    <Space/>
                    {misc.jupyter_language_to_name(@props.lang) if not @props.lang_select} Code Snippets
                </h2>
            </div>
            <div style={nav_style}>
                {@render_nav() if show_lang_nav}
            </div>
            <div style={search_style}>
                {@render_search() if not @props.unknown_lang}
            </div>
        </div>
