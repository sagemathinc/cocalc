##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, Sagemath Inc.
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

{Hints, Steps} = require('intro.js-react')
import 'intro.js/introjs.css'

{React, ReactDOM, rclass, redux, rtypes, Redux, redux_fields, Actions} = require('./smc-react')
immutable        = require('immutable')

{uuidsha1} = misc = require('smc-util/misc')

NAME = 'intro'

exports.deterministic_id = deterministic_id = (text) ->
    return "#{NAME}-#{uuidsha1(text)}"

introTypes =
    running : rtypes.bool
    hints   : rtypes.immutable.List
    steps   : rtypes.immutable.List

exports.Intro = rclass
    displayName : NAME

    reduxProps :
        intro : introTypes

    onExit: ->

    componentDidMount: ->
        setTimeout(( () =>
            actions = redux.getActions(NAME)
            actions.start()
        ), 3000)

    onClose: (data) ->
        if DEBUG
            console.log('Hint::onClose', data)
            console.log('Hint ID:', @props.hints.get(data).id)

    onStepsChanged: (data) ->
        # data is an integer number
        if DEBUG then console.log("onStepsChanged:", data)

    onStepsCompleted: ->
        if DEBUG then console.log("onStepsCompleted")

    onHintClick: (data) ->
        # data is an html element, the actual hint I presume
        #if DEBUG then console.log("onHintClick", data)

    onHintClose: (idx) ->
        # data is the index number, hence an integer
        id = @props.hints.get(idx).id
        if DEBUG then console.log("onHintClose", idx, "id", id)
        @actions(NAME).hint_closed(id)


    render: ->
        <React.Fragment>
            <Hints
                enabled  = {@props.running}
                hints    = {@props.hints.toArray()}
                onClose  = {@onClose}
                onClick  = {@onHintClick}
                onClose  = {@onHintClose}
            />
            <Steps
                enabled={@props.running}
                steps={@props.steps.toArray()}
                initialStep={0}
                onExit={@onExit}
                onAfterChange={@onStepsChanged}
                onComplete={@onStepsCompleted}
            />
        </React.Fragment>



makeIntroStore = (NAME) ->
    name: NAME
    stateTypes: introTypes
    getInitialState: ->
        running: false
        hints: immutable.List([])
        steps: immutable.List([]) # ATTN don't use steps, styles clash with ours
        todo_hints: immutable.Set([])
        level: 0   # how far advanced?


class IntroActions extends Actions
    _init: (store) ->
        @store = store

    add_hint: (hint) ->
        hints = @store.get('hints')
        hints = hints.push(hint)
        @setState(hints:hints)
        @setState(todo_hints:@store.get('todo_hints').add(hint.id))

    hint_closed: (id) ->
        todo_hints = @store.get('todo_hints').delete(id)
        @setState(todo_hints:todo_hints)
        if todo_hints.size == 0
            level = @store.get('level') + 1
            @setState(hints:@store.get('hints').clear(), level:level)
            add_section(level)

    add_step: (step) ->
        steps = @store.get('steps')
        steps = steps.push(step)
        @setState(steps:steps)

    start: ->
        @setState(running: true)


store   = redux.createStore(makeIntroStore(NAME))
actions = redux.createActions(NAME, IntroActions)
actions._init(store)

# positions: ["top-middle","top-left","top-right","bottom-left","bottom-right","bottom-middle","middle-left","middle-right","middle-middle"].

add_section = (level) ->
    switch level
        when 0
            actions.add_hint(
                id: 'projects'
                element: ".#{deterministic_id('projects-nav-button')}"
                hint: 'Click on the "Projects" button to see an overview of all your projects.'
                hintPosition: 'bottom-right'
            )

            actions.add_hint(
                id: 'account'
                element: ".#{deterministic_id('top-nav-account')}"
                hint: 'Click on the "Account" button to see your account settings.'
                hintPosition: 'bottom-right'
            )

            actions.add_hint(
                id: 'project-nav'
                element: ".#{deterministic_id('projects-nav-bar')}"
                hint: 'Switch between opened projects here.'
                hintPosition: 'bottom-middle'
            )

        when 1
            actions.add_hint(
                id: 'connection'
                element: ".#{deterministic_id('top-nav-connection')}"
                hint: 'Click here to open up the "Connection information" dialog.'
                hintPosition: 'bottom-middle'
            )

        else
            if DEBUG then console.log("intro: level #{num} all done!")

add_section(0)


