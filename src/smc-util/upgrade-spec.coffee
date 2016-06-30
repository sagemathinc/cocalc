###
Define upgrades to projects.
###

upgrades = exports.upgrades = {}

# these are the base quotas
exports.DEFAULT_QUOTAS =
    disk_quota  : 3000
    cores       : 1
    memory      : 1000
    cpu_shares  : 256
    mintime     : 3600   # hour
    network     : 0
    member_host : 0

upgrades.max_per_project =
    disk_quota : 50000
    memory     : 8000
    cores      : 4
    network    : 1
    cpu_shares : 2048
    mintime    : 24*3600*90
    member_host : 1

# In the params listed below you *MUST* define all of display, display_unit,
# display_factor, pricing_unit, pricing_factor, input_type, and desc!   This
# is assumed elsewhere.
upgrades.params =
    disk_quota :
        display        : 'Disk space'
        unit           : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        pricing_unit   : 'GB'
        pricing_factor : 1/1000
        input_type     : 'number'
        desc           : 'The maximum amount of disk space (in MB) that a project may use.'
    memory :
        display        : 'Memory'
        unit           : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        pricing_unit   : 'GB'
        pricing_factor : 1/1000
        input_type     : 'number'
        desc           : 'The maximum amount of memory that all processes in a project may use in total.'
    cores :
        display        : 'CPU cores'
        unit           : 'core'
        display_unit   : 'core'
        display_factor : 1
        pricing_unit   : 'core'
        pricing_factor : 1
        input_type     : 'number'
        desc           : 'The maximum number of CPU cores that a project may use.'
    cpu_shares :
        display        : 'CPU shares'
        unit           : 'share'
        display_unit   : 'share'
        display_factor : 1/256
        pricing_unit   : 'share'
        pricing_factor : 1/256
        input_type     : 'number'
        desc           : 'Relative priority of this project versus other projects running on the same computer.'
    mintime :
        display        : 'Idle timeout'
        unit           : 'second'
        display_unit   : 'hour'
        display_factor : 1/3600  # multiply internal by this to get what should be displayed
        pricing_unit   : 'day'
        pricing_factor : 1/86400
        input_type     : 'number'
        desc           : 'If the project is not used for this long, then it will be automatically stopped.'
    network :
        display        : 'Internet access'
        unit           : 'upgrade'
        display_unit   : 'upgrade'
        display_factor : 1
        pricing_unit   : 'upgrade'
        pricing_factor : 1
        input_type     : 'checkbox'
        desc           : 'Full internet access enables a project to connect to the computers outside of SageMathCloud, download software packages, etc.'
    member_host :
        display        : 'Member hosting'
        unit           : 'upgrade'
        display_unit   : 'upgrade'
        display_factor : 1
        pricing_unit   : 'upgrade'
        pricing_factor : 1
        input_type     : 'checkbox'
        desc           : 'Moves this project to a members-only server, which has less competition for resources.'

upgrades.field_order = ['member_host', 'network', 'mintime', 'memory', 'disk_quota', 'cpu_shares', 'cores']

# live_subscriptions is an array of arrays.  Each array should have length a divisor of 12.
# The subscriptions will be displayed one row at a time.
upgrades.live_subscriptions = [['standard', 'premium', 'professional'],
                              ['small_course', 'medium_course', 'large_course']]

upgrades.period_names =
    month  : 'month'
    year   : 'year'
    month4 : '4 months'
    year1  : 'year'

# TODO: change from "membership" to "subscription".

membership = upgrades.membership = {}

membership.professional =    # a user that has a professional membership
    icon  : 'battery-full'
    price :
        month  : 99
        year   : 999
    cancel_at_period_end : false
    benefits :
        cores       : 5
        cpu_shares  : 128*20
        disk_quota  : 5000*20
        member_host : 2*20
        memory      : 3000*20
        mintime     : 24*3600*20
        network     : 10*20

membership.premium =    # a user that has a premium membership
    icon  : 'battery-three-quarters'
    price :
        month  : 49
        year   : 499
    cancel_at_period_end : false
    benefits :
        cores       : 2
        cpu_shares  : 128*8
        disk_quota  : 5000*8
        member_host : 2*8
        memory      : 3000*8
        mintime     : 24*3600*8
        network     : 10*8

membership.standard =   # a user that has a standard membership
    icon  : 'battery-quarter'
    price :
        month  : 7
        year   : 79
    cancel_at_period_end : false
    benefits :
        cores       : 0
        cpu_shares  : 128
        disk_quota  : 5000
        member_host : 2
        memory      : 3000
        mintime     : 24*3600
        network     : 20


membership.large_course =
    icon  : 'battery-full'
    price :
        month4 : 999
        year1  : 2499
    cancel_at_period_end : true
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 250
        network     : 500

membership.medium_course =
    icon  : 'battery-three-quarters'
    price :
        month4 : 399
        year1  : 999
    cancel_at_period_end : true
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 70
        network     : 140

membership.small_course =
    icon  : 'battery-quarter'
    price :
        month4 : 199
        year1  : 499
    cancel_at_period_end : true
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 25
        network     : 50

membership.student_course =
    icon  : 'graduation-cap'
    price :
        month4 : 9
    cancel_at_period_end : true
    benefits :
        cores       : 0
        cpu_shares  : 0
        disk_quota  : 0
        member_host : 1
        network     : 1
