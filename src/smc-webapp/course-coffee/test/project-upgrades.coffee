{available_upgrades, current_student_project_upgrades, upgrade_plan} = require('../project-upgrades')

immutable = require('immutable')

misc = require('smc-util/misc')

expect  = require('expect')

describe 'test the available_upgrades function -- ', ->
    account_id = misc.uuid()
    it 'a very basic example', ->
        x = available_upgrades
            account_id          : account_id
            purchased_upgrades  : {}               # nothing bought
            project_map         : immutable.Map()  # no projects
            student_project_ids : {}
        expect(x).toEqual({})

    it 'example with some upgrades but no projects', ->
        x = available_upgrades
            account_id          : account_id
            purchased_upgrades  : {disk:5, widgets:10}
            project_map         : immutable.Map()
            student_project_ids : {}
        expect(x).toEqual({disk:5, widgets:10})

    it 'example with a project having nothing to do with the course', ->
        project_id = misc.uuid()
        x = available_upgrades
            account_id          : account_id
            purchased_upgrades  : {disk:5, widgets:10}
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id}":{upgrades:{disk:2,widgets:3}}}}})
            student_project_ids : {}
        expect(x).toEqual({disk:3, widgets:7})

    it 'example with a project in the course', ->
        project_id = misc.uuid()
        x = available_upgrades
            account_id          : account_id
            purchased_upgrades  : {disk:5, widgets:10}
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id}":{upgrades:{disk:2,widgets:3}}}}})
            student_project_ids : {"#{project_id}": true, "#{misc.uuid()}":true}
        expect(x).toEqual({disk:5, widgets:10})

    it 'example with a project in the course and one not', ->
        project_id = misc.uuid()
        project2_id = misc.uuid()
        x = available_upgrades
            account_id          : account_id
            purchased_upgrades  : {disk:5, widgets:10}
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id}":{upgrades:{disk:2,widgets:3}}}}, "#{project2_id}": {users:{"#{account_id}":{upgrades:{disk:2,widgets:3}}}}})
            student_project_ids : {"#{project_id}": true, "#{misc.uuid()}":true}
        expect(x).toEqual({disk:3, widgets:7})

describe 'test the current_student_project_upgrades function -- ', ->
    account_id = misc.uuid()
    it 'a very basic example', ->
        x = current_student_project_upgrades
            account_id          : account_id
            project_map         : immutable.Map()  # no projects
            student_project_ids : {}
        expect(x).toEqual({})

    it 'a project having nothing to do with the course', ->
        project_id = misc.uuid()
        x = current_student_project_upgrades
            account_id          : account_id
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id}":{upgrades:{disk:2,widgets:3}}}}})
            student_project_ids : {}
        expect(x).toEqual({})

    it 'a project in the course with upgrades only from account_id shows nothing', ->
        project_id = misc.uuid()
        x = current_student_project_upgrades
            account_id          : account_id
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id}":{upgrades:{disk:2,widgets:3}}}}})
            student_project_ids : {"#{project_id}": true, "#{misc.uuid()}":true}
        expect(x).toEqual({})

    it 'a project in the course with upgrades from two other users (and course owner)', ->
        project_id = misc.uuid()
        account_id2 = misc.uuid()
        account_id3 = misc.uuid()
        x = current_student_project_upgrades
            account_id          : account_id
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id3}":{upgrades:{disk:5,widgets:5}},"#{account_id2}":{upgrades:{disk:10,widgets:15}}, "#{account_id}":{upgrades:{disk:2,widgets:3}}}}})
            student_project_ids : {"#{project_id}": true, "#{misc.uuid()}":true}
        expect(x).toEqual({"#{project_id}":{disk:15,widgets:20}})

    it 'example with a project in the course and one not', ->
        project_id = misc.uuid()
        project2_id = misc.uuid()
        account_id2 = misc.uuid()
        x = current_student_project_upgrades
            account_id          : account_id
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id2}":{upgrades:{disk:2,widgets:3}}}}, "#{project2_id}": {users:{"#{account_id2}":{upgrades:{disk:2,widgets:3}}}}})
            student_project_ids : {"#{project_id}": true, "#{misc.uuid()}":true}
        expect(x).toEqual({"#{project_id}": {disk:2, widgets:3}})




describe 'test the upgrade_plan -- ', ->
    account_id = misc.uuid()
    it 'a very basic example', ->
        plan = upgrade_plan
            account_id          : account_id
            purchased_upgrades  : {}
            project_map         : immutable.Map()  # no projects
            student_project_ids : {}
            deleted_project_ids : {}
            upgrade_goal        : {}
        expect(plan).toEqual({})

    it 'with one student project', ->
        project_id = misc.uuid()
        plan = upgrade_plan
            account_id          : account_id
            purchased_upgrades  : {quota0:5, quota1:4}
            project_map         : immutable.fromJS({"#{project_id}": {users:{}}})
            student_project_ids : {"#{project_id}": true}
            deleted_project_ids : {}
            upgrade_goal        : {quota0:1, quota1:2}
        expect(plan).toEqual("#{project_id}": {quota0:1, quota1:2})

    it 'with two student projects', ->
        project_id = misc.uuid()
        project_id2 = misc.uuid()
        plan = upgrade_plan
            account_id          : account_id
            purchased_upgrades  : {quota0:5, quota1:4}
            project_map         : immutable.fromJS({"#{project_id}": {users:{}}, "#{project_id2}": {users:{}}})
            student_project_ids : {"#{project_id}": true, "#{project_id2}": true}
            deleted_project_ids : {}
            upgrade_goal        : {quota0:1, quota1:2}
        expect(plan).toEqual("#{project_id}": {quota0:1, quota1:2}, "#{project_id2}": {quota0:1, quota1:2})

    it 'with one student project and one deleted student project', ->
        project_id = misc.uuid()
        project_id2 = misc.uuid()
        plan = upgrade_plan
            account_id          : account_id
            purchased_upgrades  : {quota0:5, quota1:4}
            project_map         : immutable.fromJS({"#{project_id}": {users:{}}, "#{project_id2}": {users:{}}})
            student_project_ids : {"#{project_id}": true, "#{project_id2}": true}
            deleted_project_ids : {"#{project_id2}": true}
            upgrade_goal        : {quota0:1, quota1:2}
        expect(plan).toEqual("#{project_id}": {quota0:1, quota1:2})

    it 'with one student project with upgrades from account_id and one deleted student project that has upgrades applied by account_id, and a third project with upgrades from account_id, having nothing to do with course', ->
        project_id = misc.uuid()
        project_id2 = misc.uuid()
        project_id3 = misc.uuid()
        account_id2 = misc.uuid()
        plan = upgrade_plan
            account_id          : account_id
            purchased_upgrades  : {quota0:5, quota1:4}
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id2}":{upgrades:{quota0:1,quota1:1}}}, "#{project_id2}": {users:{"#{account_id}":{upgrades:{quota0:1,quota1:1}}}}}, "#{project_id3}":{users:{"#{account_id}":{upgrades:{quota0:1,quota1:1}}}}})
            student_project_ids : {"#{project_id}": true, "#{project_id2}": true}
            deleted_project_ids : {"#{project_id2}": true}
            upgrade_goal        : {quota0:1, quota1:2}
        expect(plan).toEqual("#{project_id}": {quota1:1})

    it 'with two student projects but insufficient upgrades for our goal for quota0', ->
        project_id = '0' + misc.uuid().slice(1)
        project_id2 = '1' + misc.uuid().slice(1)
        plan = upgrade_plan
            account_id          : account_id
            purchased_upgrades  : {quota0:5, quota1:4}
            project_map         : immutable.fromJS({"#{project_id}": {users:{}}, "#{project_id2}": {users:{}}})
            student_project_ids : {"#{project_id}": true, "#{project_id2}": true}
            deleted_project_ids : {}
            upgrade_goal        : {quota0:4, quota1:3}
        expect(plan).toEqual("#{project_id}": {quota0:4, quota1:3}, "#{project_id2}": {quota0:1, quota1:1})


    it 'with two student projects but one is already upgraded by account_id', ->
        project_id = '0' + misc.uuid().slice(1)
        project_id2 = '1' + misc.uuid().slice(1)
        plan = upgrade_plan
            account_id          : account_id
            purchased_upgrades  : {quota0:5, quota1:4}
            project_map         : immutable.fromJS({"#{project_id}": {users:{"#{account_id}":{upgrades:{quota0:1,quota1:2}}}, "#{project_id2}": {users:{}}}})
            student_project_ids : {"#{project_id}": true, "#{project_id2}": true}
            deleted_project_ids : {}
            upgrade_goal        : {quota0:1, quota1:2}
        expect(plan).toEqual("#{project_id2}": {quota0:1, quota1:2})

