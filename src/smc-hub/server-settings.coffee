###
Synchronized table that tracks server settings.
###

{site_settings_conf} = require('smc-util/db-schema')
{startswith}         = require('smc-util/misc')

# Returns:
#   - all: a mutable javascript object that is a map from each server setting to its current value.
#                      This includes VERY private info (e.g., stripe private key)
#   - pub: similar, but only subset of public info that is needed for browser UI rendering.
#   - version
#   - table: the table, so you can watch for on change events...
# These get automatically updated when the database changes.
server_settings = undefined

module.exports = (db) ->
    if server_settings?
        return server_settings
    {all, pub, version} = server_settings = {all:{}, pub:{}, version:{}}
    table = server_settings.table = db.server_settings_synctable()
    update = ->
        table.get().forEach (record, field) ->
            all[field] = record.get('value')
            if site_settings_conf[field]
                if startswith(field, 'version_')
                    all[field] = parseInt(all[field])
                    if isNaN(all[field]) or all[field]*1000 >= new Date() - 0
                        # Guard against horrible error in which version is in future (so impossible) or NaN (e.g., an invalid string pasted by admin)..
                        # In this case, just use 0, which is always satisifed.
                        all[field] = 0
                    version[field] = all[field]
                pub[field] = all[field]
            return
        # PRECAUTION: never make the required version bigger than version_recommended_browser. Very important
        # not to stupidly completely eliminate all cocalc users by a typo...
        for x in ['project', 'browser']
            field = "version_min_#{x}"
            pub[field] = version[field] = all[field] = Math.min(all[field] ? 0, all['version_recommended_browser'] ? 0)
    table.on('change', update)
    table.on('init',   update)
    return server_settings

