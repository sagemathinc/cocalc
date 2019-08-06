###
CoCalc Single-File App

This is the entrypoint for showing just one file, without any extras.
This is a reduced and modified variant of start-main.coffee.

Inititally, we want to support showing jupyter files, but it should work for all main editors (sagews, code, tex, ...).

The explicit main goal is to make this lightweight, only initialize as few stores as possible, solid kiosk mode, etc.
###

# FUTURE: This is needed only for the old non-react editors; will go away.
#html = require('./console.html') + require('./editor.html') + require('./jupyter.html') + require('./sagews/interact.html') + require('./sagews/3d.html') + require('./sagews/d3.html')
#$('body').append(html)

# deferred initialization of buttonbars until after global imports -- otherwise, the sagews sage mode bar might be blank
#{init_buttonbars} = require('./buttonbar')
#init_buttonbars()

# Load/initialize Redux-based react functionality
{redux} = require('./app-framework')

# Initialize server stats redux store
#require('./redux_server_stats')

# Systemwide notifications that are broadcast to all users (or set by admins)
#require('./system_notifications')

#require('./landing-actions')

# Makes some things work. Like the save button
require('./jquery_plugins')

# Initialize the account store.
require('./account')

# Initialize app stores, actions, etc.
require('./init_app')
require('./init_single')

#require('./notifications').init(redux)

require('./widget-markdown-input/main').init(redux)

single = require('./single_app')
single.render()
#desktop = require('./desktop_app')
#desktop.render()


$(window).on('beforeunload', redux.getActions('page').check_unload)

# Should be loaded last -- this checks the url and opens up the relevant page, etc.
require('./last')

require('./crash')
