# Make loading typescript quota.ts just work, hopefully
require('ts-node').register()

init     = require('./init')
db       = undefined
setup    = (cb) -> (init.setup (err) -> db=init.db(); cb(err))
teardown = init.teardown

async  = require('async')
expect = require('expect')

misc = require('smc-util/misc')

{quota} = require('smc-hub/kucalc/quota')

describe 'default quota', ->
    it 'basics are fine', ->
        # quota should work without any arguments
        basic = quota()
        exp =
            cpu_limit: 1
            cpu_request: 0.02
            disk_quota: 3000
            idle_timeout: 1800
            member_host: false
            memory_limit: 1000
            memory_request: 200
            network: false
            privileged: false
        expect(basic).toEqual(exp)

    it 'gives members a bit more memory by default', ->
        member = quota({}, {userX: {upgrades: {member_host : 1}}})
        exp =
            cpu_limit: 1
            cpu_request: 0.05 # set at the top of quota config
            disk_quota: 3000
            idle_timeout: 1800
            member_host: true # what this upgrade is about
            memory_limit: 1500  # set at the top of quota config
            memory_request: 300 # set at the top of quota config
            network: false
            privileged: false
        expect(member).toEqual(exp)

    it 'respects admin member/network upgrades', ->
        admin1 = quota({member_host: 1, network: 1}, {})
        exp =
            cpu_limit: 1
            cpu_request: 0.05 # set at the top of quota config
            disk_quota: 3000
            idle_timeout: 1800
            member_host: true # what this upgrade is about
            memory_limit: 1500  # set at the top of quota config
            memory_request: 300 # set at the top of quota config
            network: true # what this upgrade is about
            privileged: false
        expect(admin1).toEqual(exp)

    it 'adds up user contributions', ->
        users =
            user1:
                upgrades:
                    network        : 1
                    memory         : 1500
                    memory_request : 2500
                    cpu_shares     : 1024 * .33
            user2:
                upgrades:
                    member_host : 1
                    network     : 1
                    memory      : 123
                    cores       : .5
                    disk_quota  : 1000
            user3:
                upgrades:
                    mintime     : 99
                    memory      : 7
        added = quota({}, users)
        exp =
            network         : true
            member_host     : true
            memory_request  : 2500
            memory_limit    : 2630 # 1000 mb free
            cpu_request     : .33
            cpu_limit       : 1.5 # 1 for free
            privileged      : false
            idle_timeout    : 1899  # 1800 secs free
            disk_quota      : 4000
        expect(added).toEqual(exp)

    it 'do NOT set limits >= requests -- manage pod in kucalc does that', ->
        users =
            user1:
                upgrades:
                    member_host    : true
                    network        : true
                    memory_request : 3210

        exp =
            network         : true
            member_host     : true
            memory_request  : 3210
            memory_limit    : 1500 # 1500 mb free for members
            cpu_request     : .05
            cpu_limit       : 1
            privileged      : false
            idle_timeout    : 1800  # 1800 secs free
            disk_quota      : 3000
        expect(quota({}, users)).toEqual(exp)

    it 'caps user upgrades at their maximum', ->
        over_max =
            user2:
                upgrades:
                    network         : 2
                    member_host     : 3
                    disk_quota      : 32000 # max 20gb
                    memory          : 20000 # max 16gb
                    mintime         : 24*3600*100 # max 90 days
                    memory_request  : 10000 # max 8gb
                    cores           : 7  # max 2
                    cpu_shares      : 1024 * 4 # max 3 requests

        maxedout = quota({}, over_max)
        exp =
            cpu_limit: 2
            cpu_request: 3 # set at the top of quota config
            disk_quota: 20000
            idle_timeout: 24*3600*90
            member_host: true
            memory_limit: 16000  # set at the top of quota config
            memory_request: 8000 # set at the top of quota config
            network: true
            privileged: false
        expect(maxedout).toEqual(exp)

    it 'does not limit admin upgrades', ->
        settings =
            network         : 2
            member_host     : 3
            disk_quota      : 32000 # max 20gb
            memory          : 20000 # max 16gb
            mintime         : 24*3600*100 # max 90 days
            memory_request  : 10000 # max 8gb
            cores           : 7  # max 4 shared
            cpu_shares      : 1024 * 4 # max 3 requests

        maxedout = quota(settings, {})
        exp =
            cpu_limit: 7 # > limit
            cpu_request: 4 # > limit
            disk_quota: 32000 # > limit
            idle_timeout: 24*3600*100 # > limit
            member_host: true
            memory_limit: 20000  # > limit
            memory_request: 10000 # > limit
            network: true
            privileged: false
        expect(maxedout).toEqual(exp)

    it 'combines admin and user upgrades properly', ->
        settings =
            network         : 1
            member_host     : 0
            disk_quota      : 23000 # max 20gb
            memory          : 1000 # max 16gb
            mintime         : 24*3600*33 # max 90 days
            memory_request  : 1000 # max 8gb
            cores           : 1  # max 2 shared
            cpu_shares      : 0

        users =
            user1:
                upgrades:
                    member_host    : true
                    network        : true
                    memory_request : 3210
                    disk_quota     : 3000 # settings are already > max
                    cores          : 2
                    mintime        : 24*3600*40
                    cpu_shares     : 1024 * 0.5
            user2:
                upgrades:
                    member_host    : true
                    network        : true
                    cores          : 2
                    mintime        : 24*3600*40

        exp =
            network         : true
            member_host     : true
            memory_request  : 4210
            memory_limit    : 1500 # 1500 mb free for members
            cpu_request     : .5
            cpu_limit       : 2
            privileged      : false
            idle_timeout    : 24*3600*90  # 1800 secs free
            disk_quota      : 23000
        expect(quota(settings, users)).toEqual(exp)

    it 'does not allow privileged updates for users', ->
        users = { user1: { upgrades: { privileged: 1}}}
        q = quota({}, users)
        expect(q.privileged).toBe(false)

    it 'allows privileged updates for admins', ->
        settings = {privileged: 1}
        q = quota(settings, {})
        expect(q.privileged).toBe(true)

    it 'caps ensures a minimum lower limit for ceratin quotas', ->
        settings =
            cpu_request    : 0
            memory_request : 0
            memory_limit   : 0
        users =
            user1:
                upgrades:
                    cpu_request    : 0
                    memory_request : 0
                    memory_limit   : 0

        q = quota(settings, users)
        expect(q.cpu_request).toBeGreaterThan(0.01)
        expect(q.memory_request).toBeGreaterThan(100)
        expect(q.memory_limit).toBeGreaterThan(100)

    it 'caps depending on free vs. member', ->
        free   = {user1: { upgrades: {member_host:0}}}
        member = {user2: { upgrades: {member_host:1}}}
        qfree   = quota({}, free)
        qmember = quota({}, member)

        # checking two of them explicitly
        expect(qfree.cpu_request).toBe(0.02)
        expect(qmember.cpu_request).toBe(0.05)

        # members get strictly more than free users
        expect(qfree.cpu_request).toBeLessThan(qmember.cpu_request)
        expect(qfree.memory_request).toBeLessThan(qmember.memory_request)
        expect(qfree.memory_limit).toBeLessThan(qmember.memory_limit)


