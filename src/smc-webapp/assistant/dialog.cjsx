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
{React, ReactDOM, redux, Redux, Actions, Store, rtypes, rclass} = require('../app-framework')
{Loading, Icon, Markdown, Space} = require('../r_misc')
# cocalc libs
{defaults, required, optional} = misc = require('smc-util/misc')

# assistant components
{ExamplesHeader} = require('./header')
{ExamplesBody}   = require('./body')
{ExamplesFooter} = require('./footer')

# The root element of the Assistant dialog.
exports.ExamplesDialog = rclass ({name}) ->
    displayName : 'Examples'

    reduxProps :
        "#{name}" :
            show                : rtypes.bool
            lang                : rtypes.string      # the currently selected language
            lang_select         : rtypes.bool        # show buttons to allow selecting the language
            code                : rtypes.immutable.List    # displayed content of selected document
            descr               : rtypes.string      # markdown-formatted content of document description
            setup_code          : rtypes.string      # optional, common code in the sub-category
            prepend_setup_code  : rtypes.bool        # if true, setup code is prepended to code
            data                : rtypes.immutable   # this is the processed "raw" data, see Actions::load_data
            nav_entries         : rtypes.arrayOf(rtypes.string)  # languages at the top, iff lang_select is true
            category_list0      : rtypes.arrayOf(rtypes.string)  # list of first category entries
            category_list1      : rtypes.arrayOf(rtypes.string)  # list of second level categories
            category_list2      : rtypes.arrayOf(rtypes.string)  # third level are the document titles
            category0           : rtypes.number      # index of selected first category (left)
            category1           : rtypes.number      # index of selected second category (second from left)
            category2           : rtypes.number      # index of selected third category (document titles)
            search_str          : rtypes.string      # substring to search for -- or undefined
            search_sel          : rtypes.number      # index of selected matched documents
            submittable         : rtypes.bool        # if true, the buttons at the bottom are active
            hits                : rtypes.arrayOf(rtypes.array)  # search results
            unknown_lang        : rtypes.bool        # true if there is no known set of documents for the language

    propTypes :
        actions : rtypes.object.isRequired

    shouldComponentUpdate: (props, state) ->
        ret = misc.is_different(@props, props, [
            'show', 'lang', 'code', 'descr', 'setup_code', 'prepend_setup_code', 'data',
            'category0', 'category1', 'category2', 'search_str', 'search_sel', 'unknown_lang', 'submittable'
        ])
        ret or= misc.is_different_array(props.hits, @props.hits)
        ret or= misc.is_different_array(props.nav_entries, @props.nav_entries)
        ret or= misc.is_different_array(props.category_list0, @props.category_list0)
        ret or= misc.is_different_array(props.category_list1, @props.category_list1)
        ret or= misc.is_different_array(props.category_list2, @props.category_list2)
        return ret

    close: ->
        @props.actions.hide()

    handle_dialog_keyup: (evt) ->
        switch evt.keyCode
            when 13 #return
                if @props.submittable
                    @submit()
            when 27 # ESC
                return true # will close the dialog
            when 38 # up
                dir = -1
            when 40 # down
                dir = +1
            else
                nothing = true
        if dir?
            if @props.search_str?.length > 0 # active search
                @props.actions.search_cursor(dir)
            else
                @props.actions.select_cursor(dir)
        evt?.preventDefault()
        return false

    render: ->
        <Modal
            show      = {@props.show}
            onKeyUp   = {@handle_dialog_keyup}
            onHide    = {@close}
            bsSize    = {'large'}
            className = {'webapp-examples'}
        >
            <Modal.Header closeButton className={'modal-header'}>
               <ExamplesHeader
                   actions      = {@props.actions}
                   lang_select  = {@props.lang_select}
                   unknown_lang = {@props.unknown_lang}
                   lang         = {@props.lang}
                   search_str   = {@props.search_str}
                   nav_entries  = {@props.nav_entries}
               />
            </Modal.Header>

            <ExamplesBody
                actions            = {@props.actions}
                lang               = {@props.lang}
                unknown_lang       = {@props.unknown_lang}
                code               = {@props.code}
                setup_code         = {@props.setup_code}
                prepend_setup_code = {@props.prepend_setup_code}
                descr              = {@props.descr}
                category0          = {@props.category0}
                category1          = {@props.category1}
                category2          = {@props.category2}
                category_list0     = {@props.category_list0}
                category_list1     = {@props.category_list1}
                category_list2     = {@props.category_list2}
                search_str         = {@props.search_str}
                search_sel         = {@props.search_sel}
                hits               = {@props.hits}
                data               = {@props.data}
            />

            <ExamplesFooter
                actions            = {@props.actions}
                submittable        = {@props.submittable}
                setup_code         = {@props.setup_code}
                prepend_setup_code = {@props.prepend_setup_code}
            />
        </Modal>