# Requiring the mocha built for the browser results in a warning.
# This defines a global variable mocha.
require('../node_modules/mocha/mocha.js')
require('../node_modules/mocha/mocha.css')

# This defines global variables describe, before, it, after, etc.
console.log '***********************************'
console.log "* Running MOCHA test environment  *"
console.log '***********************************'

misc = require('misc')

has_run = false
exports.run = (modules) ->
    if has_run
        throw Error('you already ran the test suite')
    has_run = true
    mocha.setup('bdd')
    $("body").append("<a class='btn btn-default' id=mocha-clear>Close Test Output</a>").click(exports.clear)
    output = $("<div id=mocha class='well' style='pointer:cursor; position: absolute;background: white; right: 15px; left: 15px; border: 1px solid lightgrey; border-radius: 4px;'></div>").hide()
    $("body").append(output)

    if typeof(modules) == 'string'
        modules = misc.split(modules)

    window.expect = require('expect')

    load = (name) ->
        if not modules? or name in modules
            console.log "loading #{name}"
            require("./#{name}")

    for name in ['account', 'projects', 'page', 'project']
        load(name)

    mocha.run (err) ->
        console.log 'Testing complete ', err
        $("#smc-react-container").hide()
        output.show()


exports.clear = ->
    $("#smc-react-container").show()
    $("#mocha").remove()
    $("#mocha-clear").remove()

