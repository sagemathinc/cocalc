# How frequently to check if the smc-util/smc-version.js file has changed.
SMC_VERSION_CHECK_INTERVAL_S = 20
#SMC_VERSION_CHECK_INTERVAL_S = 3

# Don't tell browser clients to upgrade until this many minutes after version file updated.
SMC_VERSION_CHECK_AGE_M = 6
#SMC_VERSION_CHECK_AGE_M = 0

require_reload = require('require-reload')(require)  # used to reload the smc-version file properly
SMC_VERSION    = {version:0, min_client_version:0, min_project_version:0}
update_smc_version = () ->
    smc_version = require_reload('smc-util/smc-version')
    ver_age_s = (new Date() - smc_version.version * 1000)/1000
    #winston.debug("ver_age_s=#{ver_age_s}, SMC_VERSION_CHECK_AGE_M*60=#{SMC_VERSION_CHECK_AGE_M*60}")
    if SMC_VERSION.version and ver_age_s <= SMC_VERSION_CHECK_AGE_M * 60
        # do nothing - we wait until the version in the file is at least SMC_VERSION_CHECK_AGE_M old
        return

    if not SMC_VERSION.version  # initialization on startup
        SMC_VERSION = smc_version
        winston.debug("update_smc_version: initialize -- SMC_VERSION=#{misc.to_json(SMC_VERSION)}")
    else if not underscore.isEqual(SMC_VERSION, smc_version)
        SMC_VERSION = smc_version
        winston.debug("update_smc_version: update -- SMC_VERSION=#{misc.to_json(SMC_VERSION)}")
        send_client_version_updates()

init_smc_version = () ->
    update_smc_version()
    # update periodically, so we can inform users of new version without having
    # to actually restart the server.
    setInterval(update_smc_version, SMC_VERSION_CHECK_INTERVAL_S*1000)