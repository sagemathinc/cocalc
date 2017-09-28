# 3rd Party Libraries
immutable = require('immutable')

# Internal Libraries
misc = require('smc-util/misc')
{types} = misc

exports.get_store_def = (name) ->
    name: name

    stateTypes:
        height             : types.number         # 0 means not rendered; otherwise is the height of the chat editor
        input              : types.string         # content of the input box
        is_preview         : types.bool           # currently displaying preview of the main input chat
        last_sent          : types.string         # last sent message
        messages           : types.immutable.Map  # Map of all messages
        offset             : types.number         # information about where on screen the chat editor is located
        position           : types.number         # more info about where chat editor is located
        saved_mesg         : types.string         # The message state before saving and edited message. Potentially broken with mutiple edits
        use_saved_position : types.bool           # whether or not to maintain last saved scroll position (used when unmounting then remounting, e.g., due to tab change)
        saved_position     : types.number
        search             : types.string

    getInitialState: =>
        height             : 0
        input              : ''
        is_preview         : undefined
        last_sent          : undefined
        messages           : undefined
        offset             : undefined
        position           : undefined
        saved_mesg         : undefined
        use_saved_position : undefined
        saved_position     : undefined
        search             : ''

