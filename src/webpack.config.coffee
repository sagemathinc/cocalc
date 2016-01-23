###
Webpack configuration file

Run dev server with source maps:

    npm run webpack-watch

Then visit (say)

    https://dev0.sagemath.com/static/webpack.html

This is far from ready to use yet, e.g., we need to properly serve primus websockets, etc.:

    webpack-dev-server --port=9000 -d

Resources for learning webpack:

    - https://github.com/petehunt/webpack-howto
    - http://webpack.github.io/docs/tutorials/getting-started/

###

VERSION = 2

webpack = require('webpack')
path    = require('path')
fs      = require('fs')

# create a file base_url to set a base url
BASE_URL = if fs.existsSync('data/base_url') then fs.readFileSync('data/base_url').toString().trim() else ''
console.log("base_url='#{BASE_URL}'")

module.exports =
    entry:
        #router  : './smc-webapp/router'
        landing : './smc-webapp/landing'
        client  : './smc-webapp/client_browser.coffee'
        vendors : ['react', 'async', 'events', 'marked', 'redux', 'react-redux', 'react-timeago', 'react-bootstrap',
                   'sha1', 'underscore', 'immutable', 'react-dropzone-component', 'jquery.payment',
                   'react-widgets/lib/Combobox', 'react-widgets/lib/DateTimePicker', 'md5',
                   './smc-webapp/codemirror/codemirror.coffee'
                  ]

    output:
        path       : path.resolve(__dirname, "static/webpack/#{VERSION}/")
        publicPath : path.join(BASE_URL, "/static/webpack/#{VERSION}/")
        filename   : '[name].js'

    module:
        loaders: [
            { test: /\.cjsx$/,   loaders: ['coffee', 'cjsx'] },
            { test: /\.coffee$/, loader: 'coffee-loader' },
            { test: /\.less$/,   loader: "style-loader!css-loader!less-loader"},
            { test: /\.sass$/,   loaders: ["style", "css", "sass?indentedSyntax"]},  # https://github.com/jtangelder/sass-loader
            { test: /\.json$/,   loaders: ['json'] },
            { test: /\.png$/,    loader: "url-loader?limit=100000" },
            { test: /\.(jpg|gif)$/,    loader: "file-loader"},
            { test: /\.html$/,   loader: "html-loader"},
            { test: /\.woff(2)?(\?v=[0-9].[0-9].[0-9])?$/, loader: "url-loader?mimetype=application/font-woff" },
            { test: /\.(ttf|eot|svg)(\?v=[0-9].[0-9].[0-9])?$/, loader: "file-loader?name=[name].[ext]" },
            { test: /\.css$/,    loader: 'style!css' },
        ]

    resolve:
        # So we can require('file') instead of require('file.coffee')
        extensions : ['', '.js', '.json', '.coffee', '.cjsx']
        root       : [path.resolve(__dirname),
                      path.resolve(__dirname, 'smc-util'),
                      path.resolve(__dirname, 'smc-util/node_modules'),
                      path.resolve(__dirname, 'smc-webapp'),
                      path.resolve(__dirname, 'smc-webapp/node_modules')]

    plugins: [
        new webpack.optimize.CommonsChunkPlugin('vendors', 'vendors.js'),
        new webpack.DefinePlugin('process.env': { 'NODE_ENV': JSON.stringify(process.env.NODE_ENV || "development") })
    ]

