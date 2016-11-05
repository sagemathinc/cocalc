###
Used for potentially dangerous
code evaluation in Sage worksheets.
###


###
Cell and Worksheet below are used when eval'ing %javascript blocks.
###

{defaults} = require('smc-util/misc')

log = (s) -> console.log(s)

class Cell
    constructor: (opts) ->
        @opts = defaults opts,
            output  : undefined # jquery wrapped output area
            cell_id : undefined
        @output = opts.output
        @cell_id = opts.cell_id

class Worksheet
    constructor: (worksheet) ->
        # Copy over exactly the methods we need rather than everything.
        # This is a token attempt ot make this slightly less dangerous.
        # Obviously, execute_code is quite dangerous... for a particular project on the backend.
        @worksheet = {}
        for x in ['execute_code', 'interrupt', 'kill', 'element']
            @worksheet[x] = worksheet[x]

    execute_code: (opts) =>
        if typeof opts == "string"
            opts = {code:opts}
        @worksheet.execute_code(opts)

    interrupt: () =>
        @worksheet.interrupt()

    kill: () =>
        @worksheet.kill()

    set_interact_var: (opts) =>
        elt = @worksheet.element.find("#" + opts.id)
        if elt.length == 0
            log("BUG: Attempt to set var of interact with id #{opts.id} failed since no such interact known.")
        else
            i = elt.data('interact')
            if not i?
                log("BUG: interact with id #{opts.id} doesn't have corresponding data object set.", elt)
            else
                i.set_interact_var(opts)

    del_interact_var: (opts) =>
        elt = @worksheet.element.find("#" + opts.id)
        if elt.length == 0
            log("BUG: Attempt to del var of interact with id #{opts.id} failed since no such interact known.")
        else
            i = elt.data('interact')
            if not i?
                log("BUG: interact with id #{opts.id} doesn't have corresponding data object del.", elt)
            else
                i.del_interact_var(opts.name)

exports.sagews_eval = (code, worksheet, element, id, obj) ->
    if element?
        cell = new Cell(output : element, cell_id : id)
    worksheet = new Worksheet(worksheet)
    print     = (s...) ->
        for i in [0...s.length]
            if typeof(s[i]) != 'string'
                s[i] = JSON.stringify(s[i] ? 'undefined')
        cell.output.append($("<div></div>").text("#{s.join(' ')}"))
    try
        eval(code)
    catch js_error
        cell.output.append($("<div class='sagews-output-stderr'></div>").text("#{js_error}\n(see the Javascript console for more details)"))
        console.warn("ERROR evaluating code '#{code}' in Sage worksheet", js_error)
        console.trace()

