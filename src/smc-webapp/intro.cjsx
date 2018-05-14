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
    hints   : rtypes.immutable.List  # of strings

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

    render: ->
        <React.Fragment>
            <Hints
                enabled  = {@props.running}
                hints    = {@props.hints.toArray()}
                onClose  = {@onClose}
            />
            <Steps
                enabled={false}
                steps={[]}
                initialStep={0}
                onExit={@onExit}
            />
        </React.Fragment>



makeIntroStore = (NAME) ->
    name: NAME
    stateTypes: introTypes
    getInitialState: ->
        running: false
        hints: immutable.List([])


class IntroActions extends Actions
    _init: (store) ->
        @store = store

    add_hint: (hint) ->
        hints = @store.get('hints')
        hints = hints.push(hint)
        @setState(hints:hints)

    start: ->
        @setState(running: true)


store   = redux.createStore(makeIntroStore(NAME))
actions = redux.createActions(NAME, IntroActions)
actions._init(store)

# positions: ["top-middle","top-left","top-right","bottom-left","bottom-right","bottom-middle","middle-left","middle-right","middle-middle"].

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
    hintPosition: 'middle-middle'
)
