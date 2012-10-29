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
    r = {}
    for prop, val of obj2
        r[prop] = if obj1.hasOwnProperty(prop) then obj1[prop] else obj2[prop]
    for prop, val of obj1
        if not obj2.hasOwnProperty(prop)
            throw "TypeError: got an unexpected argument '#{prop}'"
    return r

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
    


exports.to_json = (x) -> JSON.stringify(x)
exports.from_json = (x) -> JSON.parse(x)
exports.date_to_local_iso = (d) -> (new Date(d - d.getTimezoneOffset()*60*1000)).toISOString().slice(0,-5)

exports.is_empty_object = (obj) -> Object.keys(obj).length == 0


        