###
Rendering input part of a Sage worksheet cell
###

{fromJS} = require('immutable')

options = fromJS({mode:{name:'sagews'}})

{rclass, React, rtypes} = require('../app-framework')

{CodeMirrorStatic} = require('../jupyter/codemirror-static')

{FLAGS} = require('smc-util/sagews')

exports.CellInput = rclass
    displayName: "SageCell-Input"

    propTypes :
        input  : rtypes.string
        flags  : rtypes.string

    render_input: ->
        <CodeMirrorStatic
            value   = {@props.input ? ''}
            options = {options}
            style   = {background:'white', padding:'10px'}
        />

    render: ->
        if (@props.flags?.indexOf(FLAGS.hide_input) ? -1) != -1
            return <span/>
        else
            return @render_input()
