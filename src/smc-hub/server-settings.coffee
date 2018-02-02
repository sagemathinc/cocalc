###
Synchronized table that tracks server settings.
###

{site_settings_conf} = require('smc-util/db-schema')
{startswith}         = require('smc-util/misc')

# Returns:
#   - all: a mutable javascript object that is a map from each server setting to its current value.
#                      This includes VERY private info (e.g., stripe private key)
#   - public: similar, but only subset of public info that is needed for browser UI rendering.
# These get automatically updated when the database changes.
exports.server_settings = (db) ->
    obj = {}
    pub = {}
    table = db.server_settings_synctable()
    update = ->
        table.get().forEach (record, field) ->
            obj[field] = record.get('value')
            if site_settings_conf[field] and not startswith(field, 'version_')
                pub[field] = obj[field]
            return
    table.on('change', update)
    table.on('init',   update)
    return {all:obj, public:pub}

