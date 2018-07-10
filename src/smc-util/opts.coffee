###############################################################################
#
# CoCalc: Collaborative web-based calculation
# Copyright (C) 2017, Sagemath Inc.
# AGPLv3
#
###############################################################################

###
Handling of input opts to functions and type checking.
###

PropTypes = require('prop-types')

immutable_types = require('./immutable-types')

###
Testing related env/DEVEL/DEBUG stuff
###

if process?.env?.DEVEL and not process?.env?.SMC_TEST
    # Running on node and DEVEL is set and not running under test suite
    DEBUG = true
else
    DEBUG = false

# console.debug only logs if DEBUG is true
if DEBUG
    console.debug = console.log
else
    console.debug = ->

if process?.env?.SMC_TEST
    # in test mode we *do* want exception to get thrown below when type checks fails
    TEST_MODE = true

# Checks property types on a target object with checkers in a declaration.
# Declarations should throw an Error for mismatches and undefined if OK.
types = exports.types = (target, declaration, identifier="check.types") ->
    if typeof(target) != 'object'
        throw new Error("Types was given a non-object to check")

    if typeof(declaration) != 'object'
        throw new Error("Types was given a #{typeof declaration} as a declaration instead of an object")

    PropTypes.checkPropTypes(declaration, target, 'checking a', identifier)

for key, val of PropTypes
    if key != 'checkPropTypes' and key != 'PropTypes'
        types[key] = val

types.immutable = immutable_types.immutable

# Returns a new object with properties determined by those of obj1 and
# obj2.  The properties in obj1 *must* all also appear in obj2.  If an
# obj2 property has value "defaults.required", then it must appear in
# obj1.  For each property P of obj2 not specified in obj1, the
# corresponding value obj1[P] is set (all in a new copy of obj1) to
# be obj2[P].
exports.defaults = (obj1, obj2, allow_extra, strict=false) ->
    if not obj1?
        obj1 = {}
    error  = () ->
        try
            return "(obj1=#{exports.trunc(exports.to_json(obj1),1024)}, obj2=#{exports.trunc(exports.to_json(obj2),1024)})"
        catch err
            return ""
    if not obj1?
        # useful special case
        obj1 = {}
    if typeof(obj1) != 'object'
        # We put explicit traces before the errors in this function,
        # since otherwise they can be very hard to debug.
        err = "BUG -- Traceback -- misc.defaults -- TypeError: function takes inputs as an object #{error()}"
        if strict or DEBUG or TEST_MODE
            throw new Error(err)
        else
            console.log(err)
            console.trace()
            return obj2
    r = {}
    for prop, val of obj2
        if obj1.hasOwnProperty(prop) and obj1[prop]?
            if obj2[prop] == exports.defaults.required and not obj1[prop]?
                err = "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
                if strict or DEBUG or TEST_MODE
                    throw new Error(err)
                else
                    console.warn(err)
                    console.trace()
            r[prop] = obj1[prop]
        else if obj2[prop]?  # only record not undefined properties
            if obj2[prop] == exports.defaults.required
                err = "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
                if strict or DEBUG or TEST_MODE
                    throw new Error(err)
                else
                    console.warn(err)
                    console.trace()
            else
                r[prop] = obj2[prop]
    if not allow_extra
        for prop, val of obj1
            if not obj2.hasOwnProperty(prop)
                err = "misc.defaults -- TypeError: got an unexpected argument '#{prop}' #{error()}"
                console.trace()
                if strict or DEBUG or TEST_MODE
                    throw new Error(err)
                else
                    console.warn(err)
    return r

# WARNING -- don't accidentally use this as a default:
required = exports.required = exports.defaults.required = "__!!!!!!this is a required property!!!!!!__"
