misc = require('smc-util/misc')

exports.quota = (settings, users, defaults) ->
    # so can assume defined below
    settings ?= {}
    users    ?= {}
    defaults ?= {}

    quota = misc.defaults defaults,
        network        : false
        member_host    : false
        disk_quota     : 3000
        memory_limit   : 1000        # default upper bound on RAM in MB
        memory_request : 125         # default guaranteed RAM in MB
        cpu_limit      : 1           # default upper bound on cpu
        cpu_request    : 0           # default guaranteed min cpu

    # network access
    if settings.network  # free admin-set
        quota.network = true
    else                   # paid by some user
        for _,val of users
            if val?.upgrades?.network
                quota.network = true
                break

    # member hosting, which translates to "not pre-emptible"
    if settings.member_host  # free admin-set
        quota.member_host = true
    else                   # paid by some user
        for _,val of users
            if val?.upgrades?.member_host
                quota.member_host = true
                break

    # disk space quota in MB
    if settings.disk_quota
        quota.disk_quota = to_int(settings.disk_quota)
    for _, val of users
        quota.disk_quota += to_int(val?.upgrades?.disk_quota)

    # memory limit
    if settings.memory
        quota.memory_limit = to_int(settings.memory)
    for _, val of users
        quota.memory_limit += to_int(val?.upgrades?.memory)

    # memory request
    if settings.memory_request
        quota.memory_request = Math.max(MEMORY_REQUEST_MIN, to_int(settings.memory_request))
    for _, val of users
        quota.memory_request += to_int(val?.upgrades?.memory_request)

    # cpu limits
    if settings.cores
        quota.cpu_limit = to_float(settings.cores)
    for _, val of users
        quota.cpu_limit += to_float(val?.upgrades?.cores)

    # cpu requests
    if settings.cpu_shares
        # Subtract 256 since that's what we used to set in the database manually.
        # This isn't part of anything users pay for.
        # We should probably zero this out in the db when switching.
        quota.cpu_request = Math.max(0, to_int(settings.cpu_shares) - 256) / 1024
    for _, val of users
        quota.cpu_request += to_int(val?.upgrades?.cpu_shares) / 1024

    return quota


to_int = (s) ->
    try
        n = parseInt(s)
        if isNaN(n)
            return 0
        else
            return n
    catch
        return 0

to_float = (s) ->
    try
        x = parseFloat(s)
        if isNaN(x)
            return 0
        else
            return x
    catch
        return 0

