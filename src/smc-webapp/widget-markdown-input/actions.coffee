# 3rd Party Libraries

# Internal Libraries
misc = require('smc-util/misc')
{Actions} = require('../app-framework')

# Sibling Libraries
info = require('./info')

exports.create = (redux) =>
    class MarkdownInputActions extends Actions
        get_store: ->
            redux.getStore(info.name)

        clear: (id) =>
            return unless id?
            open_inputs = @get_store().get('open_inputs').delete(id)
            @setState({open_inputs})

        set_value: (id, value) =>
            return unless id?
            open_inputs = @get_store().get('open_inputs').set(id, value)
            @setState({open_inputs})

    return MarkdownInputActions
