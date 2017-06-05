{available_upgrades, current_student_project_upgrades} = require('../project-upgrades')

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
    