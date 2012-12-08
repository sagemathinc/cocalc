# NOT USED YET

{required, defaults} = require('misc')

interact.input_box = (opts) ->
    opts = defaults opts,
        cell : required
        cb   : required
