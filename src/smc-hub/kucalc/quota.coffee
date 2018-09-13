# No matter what, every project gets SOME possibly tiny amount of guaranteed cpu.
# This is important since otherwise projects will NOT start at all, e.g., if a paying
# customer is using 100% of the cpu on the node (this will happen if their limits are
# high and they have guaranteed cpu of about 1 or more).  The project will be so slow
# it fails to start in time and times out.
MIN_POSSIBLE_CPU =
    member    : 0.05
    nonmember : 0.02

# Min possible **guaranteed** RAM.
MIN_POSSIBLE_MEMORY =
    member    : 300
    nonmember : 200

{DEFAULT_QUOTAS} = require('smc-util/upgrade-spec')


exports.quota = (settings, users) ->
    # so can assume defined below
    settings ?= {}
    users    ?= {}

    quota =
        network        : false
        member_host    : false
        disk_quota     : 3000
        memory_limit   : 1000        # upper bound on RAM in MB
        memory_request : 0           # will hold guaranteed RAM in MB
        cpu_limit      : 1           # upper bound on vCPU's
        cpu_request    : 0           # will hold guaranteed min number of vCPU's as a float from 0 to infinity.
        privileged     : false       # for elevated docker privileges (FUSE mounting, later more)
        idle_timeout   : DEFAULT_QUOTAS.mintime

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

    # elevated quota for docker container (fuse mounting and maybe more ...)
    if settings.privileged
        quota.privileged = true
    # user-upgrades are disabled on purpose (security concerns and not implemented)!
    #else
    #    for _, val of users
    #        if val?.upgrades?.privileged
    #            quota.privileged = true
    #            break

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

    # idle timeout: not used for setting up the project quotas, but necessary to know for precise scheduling on nodes
    if settings.mintime
        quota.idle_timeout = to_int(settings.mintime)
    for _, val of users
        quota.idle_timeout += to_int(val?.upgrades?.mintime)

    # memory request
    if settings.memory_request
        quota.memory_request = to_int(settings.memory_request)
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

    # ensure minimums cpu are met
    if quota.member_host
        if quota.cpu_request < MIN_POSSIBLE_CPU.member
            quota.cpu_request = MIN_POSSIBLE_CPU.member
    else
        if quota.cpu_request < MIN_POSSIBLE_CPU.nonmember
            quota.cpu_request = MIN_POSSIBLE_CPU.nonmember

    # ensure minimum memory met
    if quota.member_host
        if quota.memory_request < MIN_POSSIBLE_MEMORY.member
            quota.memory_request = MIN_POSSIBLE_MEMORY.member
    else
        if quota.memory_request < MIN_POSSIBLE_MEMORY.nonmember
            quota.memory_request = MIN_POSSIBLE_MEMORY.nonmember

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

