thunkMiddleware = require('redux-thunk')
{createStore, applyMiddleware} = require('redux')
{rootReducer} = require('./reducers')

window.smc.store = exports.store = applyMiddleware(thunkMiddleware)(createStore)(rootReducer)