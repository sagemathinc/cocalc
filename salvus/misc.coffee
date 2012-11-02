
###
# Misc. CoffeeScript functions that might are needed elsewhere.  These must *not* depend on node.
###
#
#
# Return a random element of an array
exports.random_choice = (array) -> array[Math.floor(Math.random() * array.length)]

# make it so the properties of target are the same as those of upper_bound, and each is <=.
exports.min_object = (target, upper_bounds) ->
    for prop, val of upper_bounds
        target[prop] = if target.hasOwnProperty(prop) then target[prop] = Math.min(target[prop], upper_bounds[prop]) else upper_bounds[prop]

exports.defaults = (obj1, obj2) ->
    error  = () -> "(obj1=#{exports.to_json(obj1)}, obj2=#{exports.to_json(obj2)})"
    if typeof(obj1) != 'object'
        throw "misc.defaults -- TypeError: function takes inputs as an object #{error()}"
    r = {}
    for prop, val of obj2
        if obj1.hasOwnProperty(prop)
            if obj2[prop] == exports.defaults.required and not obj1[prop]?
                throw "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
            r[prop] = obj1[prop]
        else if obj2[prop]?  # only record not undefined properties
            if obj2[prop] == exports.defaults.required
                throw "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
            else
                r[prop] = obj2[prop]
    for prop, val of obj1
        if not obj2.hasOwnProperty(prop)
            throw "misc.defaults -- TypeError: got an unexpected argument '#{prop}' #{error()}"
    return r

# WARNING -- don't accidentally use this as a default:
exports.defaults.required = "__!!!!!!this is a required property!!!!!!__"

exports.mswalltime = -> (new Date()).getTime()

exports.walltime = -> exports.mswalltime()/1000.0 

exports.uuid = ->
    `'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });`

exports.times_per_second = (f, max_time=5, max_loops=1000) ->
    # return number of times per second that f() can be called
    t = exports.walltime()
    i = 0
    tm = 0
    while true
        f()
        tm = exports.walltime() - t
        i += 1
        if tm >= max_time or i >= max_loops
            break
    return Math.ceil(i/tm)
    


exports.to_json = (x) ->
    JSON.stringify(x)
    
exports.from_json = (x) ->
    try
        JSON.parse(x)
    catch err
        console.log("from_json: error parsing #{x} (=#{exports.to_json(x)}) from JSON")
        throw err
    
exports.to_iso = (d) -> (new Date(d - d.getTimezoneOffset()*60*1000)).toISOString().slice(0,-5)

exports.is_empty_object = (obj) -> Object.keys(obj).length == 0


exports.len = (obj) -> Object.keys(obj).length

exports.keys = (obj) -> (key for key of obj)