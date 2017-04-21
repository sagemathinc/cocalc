###
Very, very simple key:value store.

The keys can be arbitrary json-able objects.
A frozen copy of the object is saved in the key:value store,
so it won't get mutated.
###

json = require('json-stable-stringify')

exports.key_value_store = ->
    return new KeyValueStore()

class KeyValueStore
    constructor: ->
        @_data = {}

    set: (key, value) =>
        if not @_data?
            throw Error("closed")
        if value.freeze?  # supported by modern browsers
            value = value.freeze() # so doesn't get mutated
        @_data[json(key)] = value

    get: (key) =>
        if not @_data?
            throw Error("closed")
        @_data[json(key)]

    delete: (key) =>
        if not @_data?
            throw Error("closed")
        delete @_data[json(key)]


    close: =>
        delete @_data