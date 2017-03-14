###
Just run some very basic startup tests.
###

actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

describe 'tests the setup code -- ', ->
    before(setup)
    after(teardown)

    it 'sets something in the store', ->
        actions.setState(test:'value')
        expect(store.get('test')).toBe('value')

    it 'checks the mode got set', ->
        expect(store.get('mode')).toBe('escape')

    it 'checks there is exactly one cell', ->
        expect(store.get('cells').size).toBe(1)

    it 'checks that cell_list has size 1', ->
        expect(store.get('cell_list').size).toBe(1)

    it 'checks that cur_id is the initial cell', ->
        expect(store.get('cur_id')).toEqual(store.get('cell_list').get(0))

    it 'inserts a cell and sees that there are now 2', ->
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(2)
