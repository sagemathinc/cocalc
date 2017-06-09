# 3rd Party Libraries
immutable = require('immutable')

# Internal Libraries
misc = require('smc-util/misc')
{types} = misc

# Sibling Libraries
info = require('./info')

exports.definition =
    name: info.name

    stateTypes:
        open_inputs : types.immutable.Map

    getInitialState: =>
        open_inputs : immutable.Map({}) # {id : String}
