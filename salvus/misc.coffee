###
# Misc. CoffeeScript functions that might are needed elsewhere.  These must *not* depend on node.
###

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

exports.walltime = -> (new Date()).getTime()/1000.0