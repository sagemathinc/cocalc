`DEBUG = true`
{computed, depends, rtypes, __internals} = require('../app-framework')
{harvest_import_functions, harvest_own_functions, generate_selectors} = __internals

# 3rd Party Libraries
expect = require('expect')
{createSelector} = require('reselect')
immutable = require('immutable')
_ = require('underscore')

# SMC Libraries
misc = require('smc-util/misc')

describe 'rtypes immutable categories', ->
    it 'Assigns all immutable types the category `IMMUTABLE`', ->
        expect(rtypes.immutable.category != "IMMUTABLE" or
                rtypes.immutable.Map.category != "IMMUTABLE" or
                rtypes.immutable.List.category != "IMMUTABLE" or
                rtypes.immutable.isRequired.category != "IMMUTABLE" or
                rtypes.immutable.Map.isRequired.category != "IMMUTABLE" or
                rtypes.immutable.List.isRequired.category != "IMMUTABLE")
        .toEqual(false)

create_account_def = () ->
    name: 'account'

    stateTypes:
        first_name : rtypes.string
        last_name  : rtypes.string
        full_name  : computed rtypes.string

    getInitialState: ->
        first_name : ""
        last_name  : ""

    full_name: (first_name, last_name) ->
        return "#{first_name} #{last_name}"

create_project_def = () ->
    name: 'project'

    reduxState:
        account :
            first_name : rtypes.string # Raw
            full_name  : rtypes.string # Computed

    stateTypes:
        use_full_name  : rtypes.bool
        defined_getter : rtypes.string
        greetings      : computed rtypes.string

    getInitialState: ->
        use_full_name : false

    defined_getter: ->
        return "cake"

    greetings: (first_name, full_name, use_full_name) ->
        if use_full_name
            return "Hello #{full_name ? 'friend'}."
        else
            return "Hi #{first_name ? 'friend'}."


describe 'harvest_import_functions', ->
    it 'Removes reduxState from the given object', ->
        store_def = create_project_def()
        harvest_import_functions(store_def)

        expect store_def.reduxState
        .toEqual undefined

    it 'Returns an object of functions', ->
        store_def = create_project_def()
        result = harvest_own_functions(store_def)

        expect(typeof result).toEqual('object')
        _.map result, (func, name) =>
            expect(typeof func).toEqual('function')

    it 'Returns an object with keys identical to the declared state names', ->
        store_def = create_project_def()
        original_names = _.keys(_.clone(store_def.reduxState.account))
        func_names = _.keys(harvest_import_functions(store_def))

        expect(func_names).toEqual(original_names)

describe 'Functions from harvest_import_functions', ->
    it 'Call the correct store', ->
        called = false
        scope =
            redux:
                getStore: (name) =>
                    if name == 'account'
                        called = true
        bound_func = harvest_import_functions(create_project_def()).full_name.bind(scope)

        expect(=> bound_func()).toThrow()
        expect(called).toEqual(true)


describe 'harvest_own_functions', ->
    it 'Removes stateTypes from the given object', ->
        store_def = create_project_def()
        harvest_own_functions(store_def)

        expect store_def.stateTypes
        .toEqual undefined

    it 'Throws an error when a computed definition is not found', ->
        store_def = create_project_def()
        delete store_def.greetings

        expect(=> harvest_own_functions(store_def))
        .toThrow("Computed value 'greetings' in store 'project' was declared but no definition was found.")

    it 'Returns an object of functions', ->
        store_def = create_project_def()
        result = harvest_own_functions(store_def)

        expect(typeof result).toEqual('object')
        _.map result, (func, name) =>
            expect(typeof func).toEqual('function')

    it 'Returns an object with keys identical to the declared state names', ->
        store_def = create_project_def()
        original_names = _.keys(_.clone(store_def.stateTypes))
        func_names = _.keys(harvest_own_functions(store_def))

        expect(func_names).toEqual(original_names)

describe 'Functions from harvest_own_functions', ->
    it 'Call @get(function_key) if `function_key` is not defined nor a computed value', ->
        called_with = ''
        scope =
            get: (name) =>
                called_with = name

        store_def = create_project_def()
        result = harvest_own_functions(store_def)
        result.use_full_name.bind(scope)()

        expect(called_with).toEqual('use_full_name')

    it 'Use input functions if defined in the store', ->
        store_def = create_project_def()
        original_function = store_def.defined_getter.toString()
        result = harvest_own_functions(store_def)

        expect(result.defined_getter.toString()).toEqual(original_function)

    it 'Use selectors defined in the store', ->
        store_def = create_project_def()
        original_function = store_def.greetings.toString()
        result = harvest_own_functions(store_def)

        expect(result.greetings.toString()).toEqual(original_function)

describe 'selectors lib', ->
    it 'selects', ->
        state = immutable.Map
            first_name : "Kimberly"
            last_name  : "Smith"
        first_name = -> state.get('first_name')
        last_name  = -> state.get('last_name')
        full_name  = -> "#{first_name()} #{last_name()}"
        short_name = -> full_name().slice(0,5)

        selector = createSelector([first_name, last_name], full_name)

        init_val = selector(state)
        init_recomps = selector.recomputations()
        state = state.set('first_name', "Katie")
        expect(first_name()).toEqual("Katie")

        update_once_val = selector(state)
        update_once_call_2_val = selector(state)

        expect(init_val).toEqual("Kimberly Smith")
        expect(update_once_val).toEqual("Katie Smith")
        expect(update_once_call_2_val).toEqual("Katie Smith")
        expect(selector.recomputations()).toEqual(init_recomps + 1)

    it 'is composable', ->
        state = immutable.Map
            first_name : "Kimberly"
            last_name  : "Smith"
        first_name = -> state.get('first_name')
        last_name  = -> state.get('last_name')
        full_name  = -> "#{first_name()} #{last_name()}"
        short_name = -> full_name().slice(0,5)

        s0 = createSelector([first_name, last_name], full_name)
        selector = createSelector(s0, short_name)

        init_val = selector(state)
        init_recomps = selector.recomputations()
        state = state.set('first_name', "Katherine")
        expect(first_name()).toEqual("Katherine")

        update_once_val = selector(state)
        update_once_call_2_val = selector(state)

        expect(init_val).toEqual("Kimbe")
        expect(update_once_val).toEqual("Kathe")
        expect(update_once_call_2_val).toEqual("Kathe")
        expect(selector.recomputations()).toEqual(init_recomps + 1)

describe 'generate_selectors', ->
    store =
        first_name : -> @state.get('first_name')
        last_name  : -> @state.get('last_name')
        # Note that the function invocations are necessary unlike when
        # writing actual stores because of the binding method
        full_name  : -> "#{@first_name()} #{@last_name()}"
        short_name : -> @full_name().slice(0,5)
        setState   : (key, val) -> @state = @state.set(key, val)

    store.state = immutable.Map
        first_name : "Kimberly"
        last_name  : "Smith"

    store.full_name.dependency_names = ["first_name", "last_name"]
    store.short_name.dependency_names = ["full_name"]

    [bound_store] = misc.bind_objects(store, [store])

    first_name_func_string = JSON.stringify(bound_store.first_name)
    store = generate_selectors(bound_store)

    it 'ignores input functions (those without arguments)', ->
        expect JSON.stringify(store.first_name)
        .toEqual first_name_func_string

    it 'computes values from input functions', ->
        expect store.full_name(store.state)
        .toEqual "Kimberly Smith"

    it 'computes values from computed values', ->
        expect store.short_name(store.state)
        .toEqual "Kimbe"

    it 'memoizes computed values', ->
        initial_comps = store.full_name.recomputations()
        val1 = store.full_name(store.state)
        val2 = store.full_name(store.state)
        expect val1
        .toEqual val2

        expect initial_comps
        .toEqual store.full_name.recomputations()

    it 'recomputes once on one input change', ->
        initial_comps = store.short_name.recomputations()
        init_val = store.short_name(store.state)
        store.state = store.setState('first_name', "Katie")

        expect(store.first_name(store.state)).toEqual("Katie")
        expect(store.full_name(store.state)).toEqual("Katie Smith")

        update_once_val = store.short_name(store.state)
        update_once_call_2_val = store.short_name(store.state)
        update_once_call_3_val = store.short_name(store.state)

        expect(init_val).not.toEqual(update_once_val)
        expect(update_once_val).toEqual(update_once_call_2_val)

        expect initial_comps + 1
        .toEqual store.short_name.recomputations()

