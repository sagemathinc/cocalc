###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
Define upgrades to projects.
###

# NOTE: This script ./upgrade-spec.coffee is copied into the Docker container
# in k8s/smc-project/manager/, so if you move or rename this script, you must
# also update that.

upgrades = exports.upgrades = {}

# these are the base quotas -- keep req_* commented out until they are also in params below.
# They are for future use for k8s
exports.DEFAULT_QUOTAS =
    disk_quota     : 3000
    cores          : 1
    cpu_shares     : 0
    memory         : 1000
    memory_request : 0
    mintime        : 1800   # hour
    network        : 0
    member_host    : 0

upgrades.max_per_project =
    disk_quota     : 50000
    memory         : 8000
    memory_request : 8000
    cores          : 4
    network        : 1
    cpu_shares     : 2048
    mintime        : 24*3600*90
    member_host    : 1

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
        display        : 'Shared RAM'
        unit           : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        pricing_unit   : 'GB'
        pricing_factor : 1/1000
        input_type     : 'number'
        desc           : 'Upper bound on RAM that all processes in a project may use in total (shared with other projects; not guaranteed).'
    memory_request :
        display        : 'Dedicated RAM'
        unit           : 'MB'
        display_unit   : 'MB'
        display_factor : 1
        pricing_unit   : 'GB'
        pricing_factor : 1/1000
        input_type     : 'number'
        desc           : "Guaranteed minimum amount of RAM that is dedicated to your project."
    cores :
        display        : 'Shared CPU'
        unit           : 'core'
        display_unit   : 'core'
        display_factor : 1
        pricing_unit   : 'core'
        pricing_factor : 1
        input_type     : 'number'
        desc           : 'Upper bound on the number of shared CPU cores that your project may use (shared with other projects; not guaranteed).'
    cpu_shares :
        display        : 'Dedicated CPU'
        unit           : 'core'
        display_unit   : 'core'
        display_factor : 1/1024
        pricing_unit   : 'core'
        pricing_factor : 1/1024
        input_type     : 'number'
        desc           : 'Guaranteed minimum number of CPU cores that are dedicated to your project.'
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
        unit           : 'project'
        display_unit   : 'project'
        display_factor : 1
        pricing_unit   : 'project'
        pricing_factor : 1
        input_type     : 'checkbox'
        desc           : 'Full internet access enables a project to connect to the computers outside of CoCalc, download software packages, etc.'
    member_host :
        display        : 'Paid hosting'
        unit           : 'project'
        display_unit   : 'project'
        display_factor : 1
        pricing_unit   : 'project'
        pricing_factor : 1
        input_type     : 'checkbox'
        desc           : 'Runs this project on a member-only host that is NOT pre-emptible; it will not be randomly rebooted and has less users.'

upgrades.field_order = ['member_host', 'network', 'mintime', 'disk_quota',
                        'memory', 'memory_request',
                        'cores', 'cpu_shares']

# live_subscriptions is an array of arrays.  Each array should have length a divisor of 12.
# The subscriptions will be displayed one row at a time.
upgrades.live_subscriptions = [['standard', 'premium', 'professional'],
                               ['small_course', 'medium_course', 'large_course'],
                               ['small_course2', 'medium_course2', 'large_course2']]

upgrades.period_names =
    month  : 'month'
    year   : 'year'
    month4 : '4 months'
    year1  : 'year'

subscription = upgrades.subscription = {}

subscription.professional =    # a user that has a professional subscription
    icon  : 'battery-full'
    price :
        month  : 99
        year   : 999
    cancel_at_period_end : false
    benefits :
        cores          : 5
        cpu_shares     : 1024
        disk_quota     : 5000*20
        member_host    : 2*20
        memory         : 3000*20
        memory_request : 1000*4
        mintime        : 24*3600*20
        network        : 10*20

subscription.premium =    # a user that has a premium subscription
    icon  : 'battery-three-quarters'
    price :
        month  : 49
        year   : 499
    cancel_at_period_end : false
    benefits :
        cores          : 2
        cpu_shares     : 512
        disk_quota     : 5000*8
        member_host    : 2*8
        memory         : 3000*8
        memory_request : 1000*2
        mintime        : 24*3600*8
        network        : 10*8

subscription.standard =   # a user that has a standard subscription
    icon  : 'battery-quarter'
    price :
        month  : 7
        year   : 79
    cancel_at_period_end : false
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 5000
        member_host    : 2
        memory         : 3000
        memory_request : 0
        mintime        : 24*3600
        network        : 20


subscription.large_course =
    icon  : 'battery-full'
    desc : 'Large course\n(250 students)'
    price :
        month4 : 999
        year1  : 2499
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 250
        network        : 250


subscription.large_course2 =
    icon  : 'battery-full'
    desc : 'Large compute heavy course\n(250 students)'
    price :
        month4 : 1999
        year1  : 4999
    cancel_at_period_end : true
    benefits :
        cores          : 250
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 250*1000
        mintime        : 264*7200  # multiple of days
        memory_request : 0
        member_host    : 250
        network        : 250

subscription.medium_course =
    icon  : 'battery-three-quarters'
    desc  : 'Medium course\n(70 students)'
    price :
        month4 : 399
        year1  : 999
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 70
        network        : 70

subscription.medium_course2 =
    icon  : 'battery-three-quarters'
    desc  : 'Medium compute heavy course\n(70 students)'
    price :
        month4 : 799
        year1  : 1999
    cancel_at_period_end : true
    benefits :
        cores          : 70
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 70*1000
        mintime        : 72*7200
        memory_request : 0
        member_host    : 70
        network        : 70

subscription.small_course =
    icon  : 'battery-quarter'
    desc  : 'Small course\n(25 students)'
    price :
        month4 : 199
        year1  : 499
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 25
        network        : 25

subscription.small_course2 =
    icon  : 'battery-quarter'
    desc  : 'Small compute heavy course\n(25 students)'
    price :
        month4 : 399
        year1  : 999
    cancel_at_period_end : true
    benefits :
        cores          : 25
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 25*1000
        mintime        : 48*3600
        memory_request : 0
        member_host    : 25
        network        : 25

subscription.student_course =
    icon  : 'graduation-cap'
    price :
        month4 : 14
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 2
        mintime        : 7600
        network        : 2

###
subscription.student_course2 =
    icon  : 'graduation-cap'
    price :
        month4 : 28
    cancel_at_period_end : true
    benefits :
        cores          : 1
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 2000
        memory_request : 0
        member_host    : 2
        mintime        : 7200
        network        : 2
###

