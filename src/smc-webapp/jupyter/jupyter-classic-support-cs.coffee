###
Temporary support for jupyter classic...  Only load this in the browser, obviously,
and **after** the account store.
###

{redux} = require('../app-framework')


account_store = redux.getStore('account')

last_jupyter_classic = undefined
account_store.on 'change', ->
    jupyter_classic = account_store.getIn(['editor_settings', 'jupyter_classic'])
    if jupyter_classic != last_jupyter_classic
        last_jupyter_classic = jupyter_classic
        if jupyter_classic
            require('../editor').switch_to_ipynb_classic()
        else
            require('./register').register()

