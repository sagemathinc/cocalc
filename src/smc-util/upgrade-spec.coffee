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
IMPORTANT: If you change this file, also update the date in webapp-lib/policies/pricing.pug
###

###
Define upgrades to projects.

NOTE: Technically upgrades.subscription should be called upgrades.plans, to better
corresponding to what stripe does...
###

# NOTE: This script ./upgrade-spec.coffee is copied into the Docker container
# in k8s/smc-project/manager/, so if you move or rename this script, you must
# also update that.

upgrades = exports.upgrades = {}

# these are the base quotas
exports.DEFAULT_QUOTAS =
    disk_quota     : 3000
    cores          : 1
    cpu_shares     : 0
    memory         : 1000
    memory_request : 0
    mintime        : 1800   # 30 minutes
    network        : 0
    member_host    : 0

upgrades.max_per_project =
    disk_quota     : 20000
    memory         : 16000
    memory_request : 8000
    cores          : 4
    network        : 1
    cpu_shares     : 1024*3
    mintime        : 24*3600*90
    member_host    : 1

# In the params listed below you *MUST* define all of display, display_unit,
# display_factor, pricing_unit, pricing_factor, input_type, and desc!   This
# is assumed elsewhere.
upgrades.params =
    disk_quota :
        display        : 'Disk Space'
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
        display        : 'Idle Timeout'
        unit           : 'second'
        display_unit   : 'hour'
        display_factor : 1/3600  # multiply internal by this to get what should be displayed
        pricing_unit   : 'day'
        pricing_factor : 1/86400
        input_type     : 'number'
        desc           : 'If the project is not used for this long, then it will be automatically stopped.'
    network :
        display        : 'Internet Access'
        unit           : 'project'
        display_unit   : 'project'
        display_factor : 1
        pricing_unit   : 'project'
        pricing_factor : 1
        input_type     : 'checkbox'
        desc           : 'Full internet access enables a project to connect to the computers outside of CoCalc, download software packages, etc.'
    member_host :
        display        : 'Member Hosting'
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

# Switch to this on the frontend when we go live with the new pricing plans.
upgrades.live_subscriptions = [['standard2', 'premium2', 'professional2'],
                               ['xsmall_course2', 'small_course2', 'medium_course2', 'large_course2'],
                               ['xsmall_basic_course', 'small_basic_course', 'medium_basic_course', 'large_basic_course']]

### OLD
upgrades.live_subscriptions = [['standard', 'premium', 'professional'],
                               ['xsmall_course2', 'small_course2', 'medium_course2', 'large_course2'],
                               ['xsmall_course',  'small_course', 'medium_course', 'large_course']]
###

upgrades.period_names =
    month  : 'month'
    year   : 'year'
    month4 : '4 months'
    week   : 'week'
    year1  : 'year'

subscription = upgrades.subscription = {}

subscription.professional =    # a user that has a professional subscription
    icon  : 'battery-full'
    desc  : 'Professional Plan'
    statement : 'COCALC PRO'
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
    desc  : 'Premium Plan'
    statement : 'COCALC PREMIUM'
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
    desc  : 'Standard Plan'
    statement : 'COCALC STANDARD'
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

subscription.professional2 =    # a user that has a professional subscription
    icon  : 'battery-full'
    desc  : 'Professional Plan'
    statement : 'COCALC PRO'
    price :
        month  : 149
        year   : 1499
    cancel_at_period_end : false
    benefits :
        cores          : 4
        cpu_shares     : 2048
        disk_quota     : 5000*20
        member_host    : 2*20
        memory         : 3000*20
        memory_request : 1000*4
        mintime        : 24*3600*20
        network        : 80

subscription.premium2 =    # a user that has a premium subscription
    icon  : 'battery-three-quarters'
    desc  : 'Premium Plan'
    statement : 'COCALC PREMIUM'
    price :
        month  : 79
        year   : 799
    cancel_at_period_end : false
    benefits :
        cores          : 2
        cpu_shares     : 1024
        disk_quota     : 5000*8
        member_host    : 2*8
        memory         : 3000*8
        memory_request : 1000*2
        mintime        : 24*3600*8
        network        : 32

subscription.standard2 =   # a user that has a standard subscription
    icon      : 'battery-quarter'
    desc      : 'Standard Plan'
    statement : 'COCALC STANDARD'
    price :
        month  : 14
        year   : 149
    cancel_at_period_end : false
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 8000
        member_host    : 4
        memory         : 4000
        memory_request : 0
        mintime        : 24*3600
        network        : 8



subscription.large_course =
    icon  : 'battery-full'
    desc : 'Basic Large Course\n(250 people)'
    statement : 'COCALC BASIC LG'
    price :
        week   : 199
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
    desc : 'Standard Large Course\n(250 people)'
    statement : 'COCALC LG'
    price :
        week   : 399
        month4 : 1999
        year1  : 4999
    cancel_at_period_end : true
    benefits :
        cores          : 250
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 250*1000
        mintime        : 25*24*3600
        memory_request : 0
        member_host    : 250
        network        : 250

subscription.medium_course =
    icon  : 'battery-three-quarters'
    desc  : 'Basic Medium Course\n(70 people)'
    statement : 'COCALC BASIC MD'
    price :
        week   : 79
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
    desc  : 'Standard Medium Course\n(70 people)'
    statement : 'COCALC MD'
    price :
        week   : 159
        month4 : 799
        year1  : 1999
    cancel_at_period_end : true
    benefits :
        cores          : 70
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 70*1000
        mintime        : 7*24*3600
        memory_request : 0
        member_host    : 70
        network        : 70

subscription.xsmall_course =
    icon  : 'battery-empty'
    desc  : 'Basic Extra Small Course\n(10 people)'
    statement : 'COCALC BASIC XS'
    price :
        week   : 19
        month4 : 99
        year1  : 249
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 10
        network        : 10

subscription.xsmall_course2 =
    icon  : 'battery-empty'
    desc  : 'Standard Extra Small\nCourse (10 people)'
    statement : 'COCALC XS'
    price :
        week   :  39
        month4 : 199
        year1  : 499
    cancel_at_period_end : true
    benefits :
        cores          : 10
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 10*1000
        mintime        : 24*3600
        memory_request : 0
        member_host    : 10
        network        : 10

subscription.small_course =
    icon  : 'battery-quarter'
    desc  : 'Basic Small Course\n(25 people)'
    statement : 'COCALC BASIC SM'
    price :
        week   :  39
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
    desc  : 'Standard Small Course\n(25 people)'
    statement : 'COCALC SM'
    price :
        week   : 79
        month4 : 399
        year1  : 999
    cancel_at_period_end : true
    benefits :
        cores          : 25
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 25*1000
        mintime        : 60*3600
        memory_request : 0
        member_host    : 25
        network        : 25

###
Basic Courses
###

subscription.xsmall_basic_course =
    icon  : 'battery-empty'
    desc  : 'Basic Extra Small\nCourse (10 people)'
    statement : 'COCALC BASIC XS'
    price :
        week   :  29
        month4 : 149
        year1  : 349
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 10
        network        : 10

subscription.small_basic_course =
    icon  : 'battery-quarter'
    desc  : 'Basic Small Course\n(25 people)'
    statement : 'COCALC BASIC SM'
    price :
        week   : 59
        month4 : 299
        year1  : 799
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 25
        network        : 25

subscription.medium_basic_course =
    icon  : 'battery-three-quarters'
    desc  : 'Basic Medium Course\n(70 people)'
    statement : 'COCALC BASIC MD'
    price :
        week   : 119
        month4 : 599
        year1  : 1499
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 70
        network        : 70

subscription.large_basic_course =
    icon  : 'battery-full'
    desc : 'Basic Large Course\n(250 people)'
    statement : 'COCALC BASIC LG'
    price :
        week   : 299
        month4 : 1499
        year1  : 3499
    cancel_at_period_end : true
    benefits :
        cores          : 0
        cpu_shares     : 0
        disk_quota     : 0
        memory         : 0
        memory_request : 0
        member_host    : 250
        network        : 250

###
Individual student
###
subscription.student_course =
    icon  : 'graduation-cap'
    statement : 'COCALC STUDENT'
    desc  : 'Student Course'
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
