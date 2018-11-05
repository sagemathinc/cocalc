
switch CC_EDITION
    when 'kucalc'
        exports.APP_ICON               = require('!file-loader!webapp-lib/cocalc-icon.svg')
        exports.APP_ICON_WHITE         = require('!file-loader!webapp-lib/cocalc-icon-white.svg')
        exports.APP_LOGO               = require('!file-loader!webapp-lib/cocalc-logo.svg')
        exports.APP_LOGO_WHITE         = require('!file-loader!webapp-lib/cocalc-icon-white-transparent.svg')
        exports.APP_LOGO_NAME          = require('!file-loader!webapp-lib/cocalc-font-black.svg')
        exports.APP_LOGO_NAME_WHITE    = require('!file-loader!webapp-lib/cocalc-font-white.svg')
    when 'cocalc'
        exports.APP_ICON               = require('!file-loader!webapp-lib/cocalc-icon.svg')
        exports.APP_ICON_WHITE         = require('!file-loader!webapp-lib/cocalc-icon-white.svg')
        exports.APP_LOGO               = require('!file-loader!webapp-lib/cocalc-logo.svg')
        exports.APP_LOGO_WHITE         = require('!file-loader!webapp-lib/cocalc-icon-white-transparent.svg')
        exports.APP_LOGO_NAME          = require('!file-loader!webapp-lib/cocalc-font-black.svg')
        exports.APP_LOGO_NAME_WHITE    = require('!file-loader!webapp-lib/cocalc-font-white.svg')
    else
        console.error("unknown CC_EDITION: '#{CC_EDITION}'")
