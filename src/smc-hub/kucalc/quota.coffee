# computing project quotas based on settings (by admin/system) and user contributions ("upgrades")


{DEFAULT_QUOTAS} = require('smc-util/upgrade-spec')
MAX_UPGRADES = require('smc-util/upgrade-spec').upgrades.max_per_project

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

# lower bound for the RAM "limit"
# in particular, we make sure member projects are above the free quota
MIN_MEMORY_LIMIT =
    member    : 1.5 * DEFAULT_QUOTAS.memory
    nonmember : DEFAULT_QUOTAS.memory


exports.quota = (settings, users) ->
    # so can assume defined below
    settings ?= {}
    users    ?= {}

    quota =
        network        : false
        member_host    : false
        disk_quota     : DEFAULT_QUOTAS.disk_quota
        memory_limit   : DEFAULT_QUOTAS.memory   # upper bound on RAM in MB
        memory_request : 0                       # will hold guaranteed RAM in MB
        cpu_limit      : DEFAULT_QUOTAS.cores    # upper bound on vCPU's
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

    # ensure minimum cpu are met
    cap_lower_bound(quota, "cpu_request", MIN_POSSIBLE_CPU)

    # ensure minimum memory request is met
    cap_lower_bound(quota, "memory_request", MIN_POSSIBLE_MEMORY)

    # ensure minimum memory limit is met
    cap_lower_bound(quota, "memory_limit", MIN_MEMORY_LIMIT)

    return quota


cap_lower_bound = (quota, name, MIN_SPEC) ->
    if quota.member_host
        if quota[name] < MIN_SPEC.member
            quota[name] = MIN_SPEC.member
    else
        if quota[name] < MIN_SPEC.nonmember
            quota[name] = MIN_SPEC.nonmember

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

