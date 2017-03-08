#!/usr/bin/env coffee
# update the colorscheme definitions

fs = require('fs')
path = require('path')
{COLORS} = require('smc-webapp/colors')

# write sass file
process.chdir(path.join(process.env['SMC_ROOT'], 'smc-webapp'))

colors_sass = ''
for c, v of COLORS
    colors_sass += "$COL_#{c}: #{v}\n"

fs.writeFileSync('_colors.sass', colors_sass)