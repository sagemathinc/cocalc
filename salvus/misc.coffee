##########################################################################
# 
# Misc. functions that are needed elsewhere.  
#
##########################################################################
#

exports.merge = (dest, objs ...) ->
    for obj in objs
        dest[k] = v for k, v of obj
    dest

# Return a random element of an array
exports.random_choice = (array) -> array[Math.floor(Math.random() * array.length)]

# modifies target in place, so that the properties of target are the
# same as those of upper_bound, and each is <=.
exports.min_object = (target, upper_bounds) ->
    for prop, val of upper_bounds
        target[prop] = if target.hasOwnProperty(prop) then target[prop] = Math.min(target[prop], upper_bounds[prop]) else upper_bounds[prop]

# Returns a new object with properties determined by those of obj1 and
# obj2.  The properties in obj1 *must* all also appear in obj2.  If an
# obj2 property has value "defaults.required", then it must appear in
# obj1.  For each property P of obj2 not specified in obj1, the
# corresponding value obj1[P] is set (all in a new copy of obj1) to
# be obj2[P].
exports.defaults = (obj1, obj2) ->
    error  = () -> "(obj1=#{exports.to_json(obj1)}, obj2=#{exports.to_json(obj2)})"
    if typeof(obj1) != 'object'
        # We put explicit traces before the errors in this function,
        # since otherwise they can be very hard to debug.
        console.trace()  
        throw "misc.defaults -- TypeError: function takes inputs as an object #{error()}"
    r = {}
    for prop, val of obj2
        if obj1.hasOwnProperty(prop)
            if obj2[prop] == exports.defaults.required and not obj1[prop]?
                console.trace()                
                throw "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
            r[prop] = obj1[prop]
        else if obj2[prop]?  # only record not undefined properties
            if obj2[prop] == exports.defaults.required
                console.trace()
                throw "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
            else
                r[prop] = obj2[prop]
    for prop, val of obj1
        if not obj2.hasOwnProperty(prop)
            console.trace()                            
            throw "misc.defaults -- TypeError: got an unexpected argument '#{prop}' #{error()}"
    return r

# WARNING -- don't accidentally use this as a default:
exports.defaults.required = "__!!!!!!this is a required property!!!!!!__"

# Current time in milliseconds since epoch
exports.mswalltime = -> (new Date()).getTime()

# Current time in seconds since epoch, as a floating point number (so much more precise than just seconds).
exports.walltime = -> exports.mswalltime()/1000.0

# We use this uuid implementation only for the browser client.  For node code, use node-uuid.
exports.uuid = ->
    `'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });`

# Return a very rough benchmark of the number of times f will run per second.
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

# convert basic structure to a JSON string
exports.to_json = (x) ->
    JSON.stringify(x)

# convert object x to a JSON string, removing any keys that have "pass" in them.
exports.to_safe_str = (x) ->
    obj = {}
    for key of x
        if key.indexOf("pass") == -1
            obj[key] = x[key]
    return exports.to_json(obj)
    
# convert from a JSON string to Javascript 
exports.from_json = (x) ->
    try
        JSON.parse(x)
    catch err
        console.log("from_json: error parsing #{x} (=#{exports.to_json(x)}) from JSON")
        throw err

# converts a Date object to an ISO string
exports.to_iso = (d) -> (new Date(d - d.getTimezoneOffset()*60*1000)).toISOString().slice(0,-5)

# returns true if the given object has no keys
exports.is_empty_object = (obj) -> Object.keys(obj).length == 0

# returns the number of keys of an object, e.g., {a:5, b:7, d:'hello'} --> 3
exports.len = (obj) -> Object.keys(obj).length

# return the keys of an object, e.g., {a:5, xyz:'10'} -> ['a', 'xyz']
exports.keys = (obj) -> (key for key of obj)

# convert an array of 2-element arrays to an object, e.g., [['a',5], ['xyz','10']] --> {a:5, xyz:'10'}
exports.pairs_to_obj = (v) ->
    o = {}
    for x in v
        o[x[0]] = x[1]
    return o
        