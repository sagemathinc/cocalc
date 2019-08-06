// adding a banner in case react crashes (it will be revealed)
const crash = require('./crash.html')
const { HELP_EMAIL } = require('smc-util/theme')
$('body').append(crash.replace(/HELP_EMAIL/g, HELP_EMAIL))
