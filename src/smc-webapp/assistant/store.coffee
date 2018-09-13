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


_                = require('underscore')
immutable        = require('immutable')
{redux, Store}  = require('../app-framework')
{INIT_STATE}     = require('./common')


###
stateTypes:
    project_id          : rtypes.string      # the project_id
    category0           : rtypes.number      # index of selected first category (left)
    category1           : rtypes.number      # index of selected second category (second from left)
    category2           : rtypes.number      # index of selected third category (document titles)
    category_list0      : rtypes.arrayOf(rtypes.string)  # list of first category entries
    category_list1      : rtypes.arrayOf(rtypes.string)  # list of second level categories
    category_list2      : rtypes.arrayOf(rtypes.string)  # third level are the document titles
    code                : rtypes.immutable.List   # displayed content of selected document
    setup_code          : rtypes.string      # optional, common code in the sub-category
    prepend_setup_code  : rtypes.bool        # if true, setup code is prepended to code
    descr               : rtypes.string      # markdown-formatted content of document description
    hits                : rtypes.arrayOf(rtypes.array)  # search results
    search_str          : rtypes.string      # substring to search for -- or undefined
    search_sel          : rtypes.number      # index of selected matched documents
    submittable         : rtypes.bool        # if true, the buttons at the bottom are active
    category1_top       : rtypes.arrayOf(rtypes.string)
    unknown_lang        : rtypes.bool        # true if there is no known set of documents for the language
###

exports.ExamplesStore = class ExamplesStore extends Store
    getInitialState: ->
        INIT_STATE

    data_lang: ->
        @get('data').get(@get('lang'))

    # First categories list, depends on selected language, sort order depends on category1_top
    get_category_list0: () ->
        category0 = @data_lang().keySeq().toArray()
        top = @get('category1_top')
        category0ordering = (el) ->
            i = - top.reverse().indexOf(el)
            return [i, el]
        return _.sortBy(category0, category0ordering)

    # Second level categories list, depends on selected index of first level
    # Sorted by category1_top and a possible 'sortweight'
    get_category_list1: () ->
        k0 = @get_category_list0()[@get('category0')]
        category1data = @data_lang().get(k0)
        category1 = category1data.keySeq().toArray()
        top = @get('category1_top')
        category1ordering = (el) ->
            so = category1data?.getIn([el, 'sortweight']) ? 0.0
            i = - top.reverse().indexOf(el)
            return [so, i, el]
        return _.sortBy(category1, category1ordering)

    # The titles of the selected documents are exactly as they're in the original data (they're an array)
    # That way, it's possible to create a coherent narrative from top to bottom
    get_category_list2: () ->
        k0 = @get_category_list0()[@get('category0')]
        k1 = @get_category_list1()[@get('category1')]
        return @data_lang().getIn([k0, k1, 'entries']).map((el) -> el.get(0)).toArray()

    # make an entry about inserting the example in the project log
    log: () ->
        lang  = @get('lang')
        path  = @get('path')

        # active search? then grab the categories from the selected hit list
        if @get('search_sel')?
            idx = @get('search_sel')
            hit = @get('hits').get(idx)
            return if (not hit?)
            [lvl1, lvl2, lvl3, title, descr, inDescr] = hit.toArray()
            [c0, c1, c2] = [lvl1, lvl2, title]
        else
            # otherwise, we can assume a selected example
            category0 = @get('category0')
            category1 = @get('category1')
            category2 = @get('category2')
            # but we double-check!
            return if (not category0?) or (not category1?) or (not category2?)
            c0 = @get_category_list0()[category0]
            c1 = @get_category_list1()[category1]
            c2 = @get_category_list2()[category2]

        entry = [c0, c1, c2]

        project_actions = redux.getProjectActions(@get('project_id'))
        project_actions.log
            event     : 'assistant'
            action    : 'insert'
            entry     : entry
            lang      : lang
            path      : path
