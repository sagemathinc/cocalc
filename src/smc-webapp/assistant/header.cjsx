##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2018, SageMath, Inc.
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

# global libs
_         = require('underscore')
immutable = require('immutable')
# react elements
{Col, Row, Panel, Button, FormGroup, Checkbox, FormControl, Well, Alert, Modal, Table, Nav, NavItem, ListGroup, ListGroupItem, InputGroup} = require('react-bootstrap')
{React, ReactDOM, redux, Redux, Actions, Store, rtypes, rclass} = require('../smc-react')
{Loading, Icon, Markdown, Space} = require('../r_misc')
# cocalc libs
{defaults, required, optional} = misc = require('smc-util/misc')

# The top part of the dialog. Shows the Title (maybe with the Language), a selector for the language, and search
outer_style =
    display        : 'flex'
    flexWrap       : 'nowrap'
    justifyContent : 'space-between'

inner_style = immutable.Map
    marginLeft  : '10px'
    marginRight : '10px'

title_style  = inner_style.merge({flex: '0 0 auto'}).toJS()
nav_style    = inner_style.merge({flex: '1 0 auto'}).toJS()
search_style = inner_style.merge({flex: '0 1 auto', marginRight: '50px'}).toJS()

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
        ret = misc.is_different(@props, props, ['lang', 'search_str', 'search_sel', 'unknown_lang'])
        ret or= misc.is_different_array(props.nav_entries, @props.nav_entries)
        return ret

    langSelect: (key) ->
        @props.actions.select_lang(key)

    search: (evt) ->
        evt.preventDefault()
        evt.stopPropagation()
        @props.actions.search(evt.target.value)

    handle_search_keyup: (evt) ->
        if not @props.search_str?.length
            return true
        switch evt.keyCode
            when 27 # ESC
                if @props.search_str?.length > 0
                    @props.actions.search('')
                else
                    return true
            when 38
                @props.actions.search_cursor(-1)
            when 40
                @props.actions.search_cursor(+1)
            else
                # let them propagate up to the dialog's key handler
                return true
        evt.preventDefault() # which
        evt.stopPropagation() # does
        evt.nativeEvent.stopImmediatePropagation() # what ?!
        return false

    search_clear: ->
        @props.actions.search('')

    # a horizontal list of clickable language categories
    render_nav: ->
        entries = @props.nav_entries ? []
        {lang2name} = require('./main')

        <Nav
            bsStyle   = {'pills'}
            style     = {marginLeft:'10px'}
            activeKey = {@props.lang}
            ref       = {'lang'}
            onSelect  = {@langSelect}
        >
            {
                entries.map (key, idx) ->
                    name = lang2name(key)
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
        bsStyle = if @props.search_str?.length > 0 then 'warning' else 'default'
        <FormGroup>
            <InputGroup className = {'webapp-examples-search'}>
                <FormControl
                    ref         = {'search'}
                    type        = {'text'}
                    placeholder = {'Search'}
                    value       = {@props.search_str ? ''}
                    onKeyUp     = {@handle_search_keyup}
                    onChange    = {@search}
                />
                <InputGroup.Button>
                    <Button
                        onClick  = {@search_clear}
                        bsStyle  = {bsStyle}
                    >
                        <Icon name={'times-circle'} />
                    </Button>
                </InputGroup.Button>
            </InputGroup>
        </FormGroup>

    render: ->
        return null if (not @props.lang?) or (not @props.lang_select?)
        show_lang_nav = @props.lang_select and not @props.unknown_lang
        {ICON_NAME, lang2name} = require('./main')

        <div style={outer_style}>
            <div style={title_style}>
                <h2>
                    <Icon name={ICON_NAME} />
                    <Space/>
                    {lang2name(@props.lang) if not @props.lang_select} Assistant
                </h2>
            </div>
            <div style={nav_style}>
                {@render_nav() if show_lang_nav}
            </div>
            <div style={search_style}>
                {@render_search() if not @props.unknown_lang}
            </div>
        </div>
