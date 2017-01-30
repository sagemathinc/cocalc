###
Periodically check the current version of the SMC code.  When it changes fire a change event.

To use, do

    smc_version = require('hub-version')
    smc_version.on('change', console.log)   # emited when version changes (waits CHECK_AGE_M after version time)
    smc_version.version   # current version


(c) William Stein (SageMath, Inc.), 2016.
###

CHECK_INTERVAL_S = 10

# Do not fire change event utnil this many minutes after version updated.
# We wait to give webpack (etc.) a chance to get updated.
CHECK_AGE_M = 6
#CHECK_AGE_M = 0

{EventEmitter}  = require('events')
path            = require('path')
fs              = require('fs')
winston         = require('winston')
require_reload  = require('require-reload')(require)  # used to reload the smc-version file properly
underscore      = require('underscore')
misc            = require('smc-util/misc')
misc_node       = require('smc-util-node/misc_node')

# smc webapp version: when compiling with webpack, the smc-version file is read by webpack.config
# and its `version` compiled into the resulting javascript and also stored in the assets.js file.
# In the `metadata` entry, it does contain the version, build date, build timestamp, and git revision.
# Here, we are only interested in the `version`, to compare it with the version of smc-version.

get_smc_webapp_version = (cb) ->
    # with the new containerized setup, the compiled smc webapp is separated from the hub
    # therefore, there is no direct file-based information about the webapp available
    # TODO replace this useless callback with a http call, to retrieve the assets.json file
    # History: revision 6d7dc3067c82830 shows how this has been done before that!

    # temporarily disabled
    cb(null, 0); return
    # TODO assets_json = retrieve base_url/assets.json
    try
        data = JSON.parse(assets_json)
        webapp_ver = data.metadata?.version ? 0
        # winston.debug("get_smc_webapp_version: #{webapp_ver}")
        cb(null, webapp_ver)
    catch err
        winston.warn("get_smc_webapp_version: error reading webapp's assets.json -- #{err}")
        cb(err, 0)


# Do a sanity check on the ver object to make sure it doesn't make it impossible
# for clients to update.  (I'm just imaging future me doing some stupid editing of
# the version field by hand.)
sanity_check = (ver) ->
    # ver should have fields version, min_browser_version, and min_project_version.
    ver.version             ?= 0
    ver.min_browser_version ?= 0
    ver.min_project_version ?= 0
    ver.webapp_version      ?= 0
    # the browser can only update to the latest available code
    if ver.webapp_version > 0 and ver.webapp_version < ver.min_browser_version
        ver.min_browser_version = ver.webapp_version
    # The min version shouldn't be bigger than the actual version
    # (which is the newest the client can update to).
    if ver.version < ver.min_browser_version
        ver.min_browser_version = ver.version
    if ver.version < ver.min_project_version
        ver.min_project_version = ver.version
    return ver

class Version extends EventEmitter
    constructor: (@check_interval_s=CHECK_INTERVAL_S, @check_age_m=CHECK_AGE_M) ->
        # check_interval_s -- How frequently to check if the smc-util/smc-version
        #                     module has changed.
        # check_age_m      -- Don't tell browser clients to upgrade until this
        #                     many minutes after version file updated.
        # initialization: short-circuit the @update check
        @load_smc_version (err, smc_version) =>
            if err?
                winston.debug("Version.constructor err=#{err}")
            @set_smc_version(smc_version)
            @_check = setInterval(@update, @check_interval_s*1000)

    load_smc_version: (cb) ->
        ver                = require_reload('smc-util/smc-version')
        get_smc_webapp_version (err, webapp_version) ->
            ver.webapp_version = webapp_version
            cb(err, sanity_check(ver))

    set_smc_version: (smc_version) =>
        for k, v of smc_version
            @[k] = v

    close: =>
        if @_check?
            clearInterval(@_check)
            delete @_check

    update: =>
        @load_smc_version (err, smc_version) =>
            # winston.debug("Version.update: smc_version = #{misc.to_json(smc_version)}")
            if err?
                winston.debug("Version.update err=#{err}")
            if not smc_version.version
                # not using versions
                return
            ver_age_s = (new Date() - smc_version.version * 1000)/1000
            # winston.debug("Version.update: ver_age_s=#{ver_age_s}, CHECK_AGE_M*60=#{CHECK_AGE_M*60}")
            if ver_age_s <= @check_age_m * 60
                # do nothing - we wait until the version in the file is at least SMC_VERSION_CHECK_AGE_M old
                return
            if not underscore.isEqual(@version, smc_version.version)
                # we have a new version: updating the instance fields and emitting it to listeners
                @set_smc_version(smc_version)
                winston.debug("update_smc_version: update -- #{misc.to_json(smc_version)}")
                @emit('change', smc_version)

# export a single version object
module.exports = new Version()
