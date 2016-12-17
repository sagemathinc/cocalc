##############################################################################
#
#    SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, SageMath, Inc.
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

# Wizard
# This is a modal dialog, which downloads a hierarchical collection of code snippets
# with descriptions. It returns an object, containing the code and the language:
# {"code": "...", "lang" : "..."} via a given callback.
#
# Usage:
# w = render_wizard(target, project_id, filename, lang = mode, cb = cb)
#     * target: jquery dom object, where react is put into
#     * project_id and filename to make state in redux unique
#     * lang is the mode (sage, r, python, ...)
#     * cb: the handler that's used for inserting the selected document
# API (implemented in WizardActions)
# w.show([lang=lang]) -- show dialog again (same state!) and if
#                        language given, a selection of it is triggered

_ = require("underscore")
{defaults, required, optional} = require('smc-util/misc')
misc_page = require('./misc_page')

markdown = require('./markdown')

# the json from the server, where the entries for the documents are
# double-nested objects (two hiearchies of categories) mapping to title/code/description documents
DATA = null

# react wizard
{React, ReactDOM, redux, Redux, Actions, Store, rtypes, rclass} = require('./smc-react')
{Col, Row, Panel, Button, FormGroup, FormControl, Well, Alert, Modal, Table, Nav, NavItem, ListGroup, ListGroupItem} = require('react-bootstrap')
{Loading, Icon, Markdown} = require('./r_misc')

redux_name = (project_id, path) ->
    return "wizard-#{project_id}-#{path}"

class WizardStore extends Store

class WizardActions extends Actions
    get: (key) ->
        @redux.getStore(@name).get(key)

    set: (update) ->
        @setState(update)

    show: (lang='sage') =>
        if lang != @get('lang')
            @init(lang=lang)
        else
            @set(show: true)

    reset: ->
        @set
            cat0       : null # idx integer
            cat1       : null # idx integer
            cat2       : null # idx integer
            catlist0   : []
            catlist1   : []
            catlist2   : []
            code       : ''
            descr      : ''
            hits       : []
            search_str : null
            search_sel : null
            submittable: false
            cat1_top   : ["Intro", "Tutorial", "Help"]

    hide: =>
        @set(show: false)

    init: (lang='sage') ->
        @reset()
        @set(lang: lang)
        @load_data()
        @set(show: true)

    init_data: (data) ->
        @set(data: data)
        nav_entries = []
        for key in _.keys(data)
            entry = switch key
                        when 'gap'
                            ['gap', 'GAP']
                        else
                            [key, key[0].toUpperCase() + key[1..]]
            if _.keys(data[key]).length > 0
                nav_entries.push(entry)
        @set(nav_entries: nav_entries)
        @select_lang(@get('lang'))

    insert: (cb, descr) ->
        # this is the essential task of the wizard:
        # call the callback with the selected code snippet
        data =
            code  : @get('code')
            lang  : @get('lang')
            descr : if descr then @get('descr') else null
        cb(data)

    load_data: () ->
        if not DATA?
            require.ensure [], =>
                # DATA is a global variable!
                DATA = require('wizard/wizard.json')
                @init_data(DATA)
        else
            @init_data(DATA)

    data_lang: () ->
        @get('data').get(@get('lang'))

    get_catlist0: () ->
        @data_lang().keySeq().toArray().sort(@cat_sort)

    get_catlist1: () ->
        k0 = @get_catlist0()[@get('cat0')]
        @data_lang().get(k0).keySeq().toArray().sort(@cat_sort)

    get_catlist2: () ->
        k0 = @get_catlist0()[@get('cat0')]
        k1 = @get_catlist1()[@get('cat1')]
        @data_lang().getIn([k0, k1]).map((el) -> el.get(0)).toArray()

    select_lang: (lang) ->
        @reset()
        @set(lang: lang)
        catlist0 = @get_catlist0()
        @set(catlist0 : catlist0)
        if catlist0.length == 1
            @set_selected_category(0, 0)

    search: (search_str) ->
        @reset()
        if not search_str? or search_str.length == 0
            @select_lang(@get('lang'))
            return
        @set(search_str : search_str)
        str = search_str.toLowerCase()
        hits = []
        data_lang = @data_lang()
        EnoughResultsException = {}
        try
            data_lang.forEach (data1, lvl1) ->
                data1.forEach (data2, lvl2) ->
                    data2.forEach (entry, lvl3) ->
                        title = entry.get(0)
                        descr = entry.getIn([1, 1])
                        inTitle = title.toLowerCase().indexOf(str)
                        inDescr = descr.toLowerCase().indexOf(str)
                        if inTitle != -1 or inDescr != -1
                            hits.push([lvl1, lvl2, lvl3, title, descr, inDescr])
                            if hits.length >= 30
                                throw EnoughResultsException
        catch ex
            if ex isnt EnoughResultsException
                throw ex
        @set
            hits: hits

    search_selected: (idx) ->
        [lvl1, lvl2, lvl3, title, descr, inDescr] = @get('hits').get(idx).toArray()
        doc = @data_lang().getIn([lvl1, lvl2, lvl3])
        @show_doc(doc)
        @set(search_sel : idx)

    search_cursor: (dir) ->
        # searching and then cursor-selecting search results
        # dir: +1 → downward / -1 → upward
        if not @get('hits')?
            return
        l = @get('hits').size
        if not @get('search_sel')?
            if dir > 0
                new_sel = 0
            else
                new_sel = l - 1
        else
            l = @get('hits').size
            new_sel = (@get('search_sel') + dir) % l
            if new_sel < 0
                new_sel = l - 1
        @set(search_sel : new_sel)
        @search_selected(new_sel)

    show_doc: (doc) ->
        @set
            code        : doc.getIn([1, 0])
            descr       : doc.getIn([1, 1])
            submittable : true

    cat_sort: (a, b) =>
        # ordering operator, such that some entries are in front
        top = @get('cat1_top')
        ord = (el) ->
            i = top.reverse().indexOf(el)
            return 1 - i
        return ord(a) - ord(b) or a > b


    select_cursor: (dir) ->
        # dir: only 1 or -1!
        # +1 → downward, higher idx number, first in list
        # -1 → upwards, lower index, last in list
        cat0 = @get('cat0')
        cat1 = @get('cat1')
        cat2 = @get('cat2')
        # console.log 'cat0', cat0, 'cat1', cat1, 'cat2', cat2
        top_or_bottom = (list) ->
            if dir < 0 then list.length - 1 else 0
        # dealing with some corner cases first
        if not cat0?
            catlist0 = @get_catlist0()
            if catlist0?.length > 0
                @set_selected_category(0, top_or_bottom(catlist0))
        else if not cat1?
            catlist1 = @get_catlist1()
            if catlist1?.length > 0
                @set_selected_category(1, top_or_bottom(catlist1))
        else if not cat2?
            catlist2 = @get_catlist2()
            if catlist2?.length > 0
                @set_selected_category(2, top_or_bottom(catlist2))
        else # cat0 1 and 2 are defined (i.e. we have a selection)
            l0 = @get('catlist0').size
            l1 = @get('catlist1').size
            l2 = @get('catlist2').size
            cat2_next = cat2 + dir

            # the next two blocks take care of carry in cat 2 and 1
            # trick: to accomodate for lists of varying length, an index
            # of -1 is fine -- see @set_selected_category
            if cat2_next < 0
                cat1_next = cat1 - 1
            else if cat2_next >= l2
                cat2_next = 0
                cat1_next = cat1 + 1

            if cat1_next < 0
                cat0_next = cat0 - 1
            else if cat1_next >= l1
                cat1_next = 0
                cat0_next = cat0 + 1

            if cat0_next?
                # wrap cat0 around (no curry)
                cat0_next = (cat0_next) % l0
                if cat0_next < 0
                    cat0_next = l0 - 1
                @set_selected_category(0, cat0_next)
            if cat1_next?
                @set_selected_category(1, cat1_next)
            @set_selected_category(2, cat2_next)

    set_selected_category: (level, idx) ->
        lang = @data_lang()
        switch level
            when 0, 1
                @set(code: '', descr: '', cat2 : null, submittable: false)
        switch level
            when 0
                @set(cat0: if idx == -1 then @get('catlist0').size - 1 else idx)
                catlist1 = @get_catlist1()
                @set
                    cat1     : null
                    cat2     : null
                    catlist1 : catlist1
                    catlist2 : []
                if catlist1.length == 1
                    @set_selected_category(1, 0)
            when 1
                cat0     = @get('cat0')
                @set(cat1 : if idx == -1 then @get('catlist1').size - 1 else idx)
                catlist2 = @get_catlist2()
                @set
                    cat2     : null
                    catlist2 : catlist2
                if catlist2.length == 1
                    @set_selected_category(2, 0)
            when 2
                k0 = @get('catlist0').get(@get('cat0'))
                k1 = @get('catlist1').get(@get('cat1'))
                idx = if idx == -1 then @get('catlist2').size - 1 else idx
                doc = lang.getIn([k0, k1, idx])
                @set(cat2 : idx)
                @show_doc(doc)

WizardHeader = rclass
    displayName : 'WizardHeader'

    propTypes:
        actions     : rtypes.object
        nav_entries : rtypes.array
        search_str  : rtypes.string
        lang        : rtypes.string.isRequired

    getDefaultProps: ->
        search_str : ''

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

    render_nav: ->
        entries = @props.nav_entries
        entries ?= []
        <Nav bsStyle="pills" activeKey={@props.lang} ref='lang' onSelect={@langSelect}>
            {entries.map (entry, idx) =>
                    [key, name] = entry
                    <NavItem key={key} eventKey={key} title={name}>{name}</NavItem>
            }
        </Nav>

    render: ->
        <Row>
            <Col sm={3}><h2><Icon name='magic' /> Wizard</h2></Col>
            <Col sm={5}>
                {@render_nav()}
            </Col>
            <Col sm={3}>
                <FormGroup>
                    <FormControl ref='search'
                       type='text'
                       className='smc-wizard-search'
                       placeholder='Search'
                       value={@props.search_str ? ''}
                       onKeyUp={@handle_search_keyup}
                       onChange={@search}  />
                </FormGroup>
            </Col>
        </Row>

WizardBody = rclass
    displayName : 'WizardBody'

    propTypes:
        actions    : rtypes.object
        data       : rtypes.object
        lang       : rtypes.string.isRequired
        code       : rtypes.string
        descr      : rtypes.string
        cat0       : rtypes.number
        cat1       : rtypes.number
        cat2       : rtypes.number
        catlist0   : rtypes.arrayOf(rtypes.string)
        catlist1   : rtypes.arrayOf(rtypes.string)
        catlist2   : rtypes.arrayOf(rtypes.string)
        search_str : rtypes.string
        search_sel : rtypes.number
        hits       : rtypes.arrayOf(rtypes.array)

    getDefaultProps: ->
        descr      : ''
        search_str : ''

    componentDidMount: ->
        @scrollTo0 = _.debounce (() -> $(ReactDOM.findDOMNode(@refs.list_0)).find('.active').scrollIntoView()), 50
        @scrollTo1 = _.debounce (() -> $(ReactDOM.findDOMNode(@refs.list_1)).find('.active').scrollIntoView()), 50
        @scrollTo2 = _.debounce (() -> $(ReactDOM.findDOMNode(@refs.list_2)).find('.active').scrollIntoView()), 50
        @scrollToS = _.debounce (() -> $(ReactDOM.findDOMNode(@refs.search_results_list)).find('.active').scrollIntoView()), 50

    componentDidUpdate: (props, state) ->
        @scrollTo0()
        @scrollTo1()
        @scrollTo2()
        @scrollToS()

    category_selection: (level, idx) ->
        @props.actions.set_selected_category(level, idx)

    category_list: (level) ->
        cat  = @props["cat#{level}"]
        list = @props["catlist#{level}"]
        if not list?
            list = []
        # don't use ListGroup & ListGroupItem with onClick, because then there are div/buttons (instead of ul/li) and layout is f'up
        <ul className='list-group' ref="list_#{level}">
            {list.map (name, idx) =>
                click  = @category_selection.bind(@, level, idx)
                active = if idx == cat then 'active' else ''
                <li className={"list-group-item " + active} onClick={click} key={idx}>{name}</li>
            }
        </ul>

    search_result_selection: (idx) ->
        @props.actions.search_selected(idx)

    render_search_results: ->
        ss = @props.search_str
        <ul className='list-group' ref='search_results_list'>
            {@props.hits.map (hit, idx) =>
                [lvl1, lvl2, lvl3, title, descr, inDescr] = hit
                click = @search_result_selection.bind(@, idx)
                title_hl = title.replace(new RegExp(ss, "gi"), "<span class='hl'>#{ss}</span>")
                if inDescr != -1
                    i = Math.max(0, inDescr-30)
                    j = Math.min(descr.length, inDescr+30+ss.length)
                    t = descr[inDescr...inDescr+ss.length]
                    snippet = descr[i..j].replace(new RegExp(ss, "gi"), "<span class='hl'>#{t}</span>")
                    if i > 0
                        snippet = '...' + snippet
                    if j < descr.length
                        snippet = snippet + '...'
                active = if @props.search_sel == idx then 'active' else ''
                <li className={"list-group-item " + active} onClick={click} key={idx}>
                    {lvl1} → {lvl2} → <span style={fontWeight: 'bold'} dangerouslySetInnerHTML={__html : title_hl}></span>
                    {' '}{<span className='snippet'} dangerouslySetInnerHTML={__html : snippet}></span> if snippet?.length > 0}
                </li>
            }
        </ul>

    render_top: ->
        searching = @props.search_str?.length > 0
        if not @props.data?
            <Row>
                <Col sm={8} smOffset={4}>
                    <ul className='list-group'>
                        <li></li><li></li>
                        <li><Loading /></li>
                    </ul>
                </Col>
            </Row>
        else if searching
            <Row>
                <Col sm={12}>{@render_search_results()}</Col>
            </Row>
        else
            <Row>
                <Col sm={3}>{@category_list(0)}</Col>
                <Col sm={3}>{@category_list(1)}</Col>
                <Col sm={6}>{@category_list(2)}</Col>
            </Row>

    render: ->
        <Modal.Body className='modal-body'>
            {@render_top()}
            <Row>
                <Col sm={6}>
                    <pre ref='code' className='code'>{@props.code}</pre>
                </Col>
                <Col sm={6}>
                    <Panel ref='descr' className='smc-wizard-descr'>
                        <Markdown value={@props.descr} />
                    </Panel>
                </Col>
            </Row>
        </Modal.Body>


RWizard = (name) -> rclass
    displayName : 'Wizard'

    reduxProps :
        "#{name}" :
            show        : rtypes.bool
            lang        : rtypes.string
            code        : rtypes.string
            descr       : rtypes.string
            data        : rtypes.object
            search      : rtypes.string
            nav_entries : rtypes.arrayOf(rtypes.arrayOf(rtypes.string))
            catlist0    : rtypes.arrayOf(rtypes.string)
            catlist1    : rtypes.arrayOf(rtypes.string)
            catlist2    : rtypes.arrayOf(rtypes.string)
            cat0        : rtypes.number
            cat1        : rtypes.number
            cat2        : rtypes.number
            search_str  : rtypes.string
            search_sel  : rtypes.number
            submittable : rtypes.bool
            hits        : rtypes.arrayOf(rtypes.array)

    propTypes :
        cb      : rtypes.func
        actions : rtypes.object.isRequired

    getInitialState: ->
        search  : ''

    close: ->
        @props.actions.hide()

    insert_code: ->
        @props.actions.insert(@props.cb, false)
        @close()

    insert_all: ->
        @props.actions.insert(@props.cb, true)
        @close()

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
        evt.preventDefault() # which
        evt.stopPropagation() # does
        evt.nativeEvent.stopImmediatePropagation() # what ?!
        return false

    render: ->
        <Modal show={@props.show}
               onKeyUp={@handle_dialog_keyup}
               onHide={@close}
               bsSize="large"
               className="smc-wizard">
            <Modal.Header closeButton className='modal-header'>
               <WizardHeader actions     = {@props.actions}
                             lang        = {@props.lang}
                             search_str  = {@props.search_str}
                             nav_entries = {@props.nav_entries} />
            </Modal.Header>

            <WizardBody actions    = {@props.actions}
                        lang       = {@props.lang}
                        code       = {@props.code}
                        descr      = {@props.descr}
                        cat0       = {@props.cat0}
                        cat1       = {@props.cat1}
                        cat2       = {@props.cat2}
                        catlist0   = {@props.catlist0}
                        catlist1   = {@props.catlist1}
                        catlist2   = {@props.catlist2}
                        search_str = {@props.search_str}
                        search_sel = {@props.search_sel}
                        hits       = {@props.hits}
                        data       = {@props.data} />

            <Modal.Footer>
                <Button onClick={@insert_code} disabled={not @props.submittable} bsStyle='success'>Only Code</Button>
                <Button onClick={@insert_all} disabled={not @props.submittable} bsStyle='success'>Insert</Button>
                <Button onClick={@props.actions.hide}>Close</Button>
            </Modal.Footer>
        </Modal>

exports.render_wizard = (target, project_id, path, lang = 'sage', cb = null) ->
    name = redux_name(project_id, path)
    actions = redux.getActions(name)
    if not actions?
        actions = redux.createActions(name, WizardActions)
        store   = redux.createStore(name)
    actions.init(lang=lang)
    W = RWizard(name)
    ReactDOM.render(<Redux redux={redux}><W cb={cb} actions={actions}/></Redux>, target)
    return actions
