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
        member = quota({}, {'user-id': {'upgrades': {'member_host': 1}}})
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
        admin1 = quota({'member_host': 1, 'network': 1}, {})
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
            "user-id-1":
                upgrades:
                    network        : 1
                    memory         : 1500
                    memory_request : 2500
                    cpu_shares     : 1024 * .33
            "user-id-2":
                upgrades:
                    member_host : 1
                    network     : 1
                    memory      : 123
                    cores       : .5
                    disk_quota  : 1000
            "user-id-3":
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

    it 'doe NOT set limits >= requests -- manage pod in kucalc does that', ->
        users =
            "user-1":
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
            "user-id-2":
                upgrades:
                    network         : 2
                    member_host     : 3
                    disk_quota      : 32000 # max 20gb
                    memory          : 20000 # max 16gb
                    mintime         : 24*3600*100 # max 90 days
                    memory_request  : 10000 # max 8gb
                    cores           : 7  # max 4 shared
                    cpu_shares      : 1024 * 4 # max 3 requests

        maxedout = quota({}, over_max)
        exp =
            "cpu_limit": 3
            "cpu_request": 3*1024 # set at the top of quota config
            "disk_quota": 20000
            "idle_timeout": 24*3600*90
            "member_host": true # what this upgrade is about
            "memory_limit": 16000  # set at the top of quota config
            "memory_request": 8000 # set at the top of quota config
            "network": true # what this upgrade is about
            "privileged": false
        #expect(maxedout).toEqual(exp)













