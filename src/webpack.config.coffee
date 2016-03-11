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

_        = require('lodash')
webpack  = require('webpack')
path     = require('path')
fs       = require('fs')


VERSION  = "0.0.0"
INPUT    = path.resolve(__dirname, "static")
OUTPUT   = "static/webpack/"
DEVEL    = "development"
NODE_ENV = process.env.NODE_ENV || DEVEL
dateISO  = new Date().toISOString()

# create a file base_url to set a base url
BASE_URL = if fs.existsSync('data/base_url') then fs.readFileSync('data/base_url').toString().trim() + "/" else ''
console.log("NODE_ENV=#{NODE_ENV}; base_url='#{BASE_URL}'; INPUT='#{INPUT}'; OUTPUT='#{OUTPUT}'")

# plugins

# deterministic hashing for assets
WebpackSHAHash = require('webpack-sha-hash')
webpackSHAHash = new WebpackSHAHash()

# cleanup like "make distclean" (necessary, otherwise there are millions of hashed filenames)
CleanWebpackPlugin = require('clean-webpack-plugin')
cleanWebpackPlugin = new CleanWebpackPlugin [OUTPUT],
                                            verbose: true
                                            dry: false

# assets.json file
AssetsPlugin = require('assets-webpack-plugin')
assetsPlugin = new AssetsPlugin
                        filename: "assets.json"
                        fullPath: no
                        prettyPrint: true
                        metadata:
                            version: VERSION
                            date: dateISO

# https://www.npmjs.com/package/html-webpack-plugin
HtmlWebpackPlugin = require('html-webpack-plugin')
htmlWebpackPlugin = new HtmlWebpackPlugin
                              date    : dateISO
                              filename: 'index.html',
                              template: 'index.ejs'

# https://webpack.github.io/docs/stylesheets.html
ExtractTextPlugin = require("extract-text-webpack-plugin")

# merge + minify of included CSS files
cssConfig = JSON.stringify({discardComments: {removeAll: true}, mergeLonghand: true, sourceMap: true})
#extractCSS = new ExtractTextPlugin("styles-[hash].css")
#extractTextCss  = ExtractTextPlugin.extract("style", "css?sourceMap&#{cssConfig}")
#extractTextSass = ExtractTextPlugin.extract("style", "css?#{cssConfig}!sass?sourceMap&indentedSyntax")
#extractTextScss = ExtractTextPlugin.extract("style", "css?#{cssConfig}!sass?sourceMap")
#extractTextLess = ExtractTextPlugin.extract("style", "css?#{cssConfig}!less?sourceMap")

# custom plugin, to handle the quirky situation of index.html
class MoveFilesToTargetPlugin
    constructor: (@files, @target) ->

MoveFilesToTargetPlugin.prototype.apply = (compiler) ->
    compiler.plugin "done", (comp) =>
        #console.log('compilation:', _.keys(comp.compilation))
        _.forEach @files, (fn) =>
            src = path.join(path.resolve(__dirname, OUTPUT), fn)
            dst = path.join(@target, fn)
            console.log("moving file:", src, "→", dst)
            fs.renameSync(src, dst)

moveFilesToTargetPlugin = new MoveFilesToTargetPlugin(["index.html"], INPUT)

###
CopyWebpackPlugin = require('copy-webpack-plugin')
copyWebpackPlugin = new CopyWebpackPlugin []
###

setNODE_ENV          = new webpack.DefinePlugin
                                'process.env':
                                    'NODE_ENV': JSON.stringify(NODE_ENV)

dedupePlugin         = new webpack.optimize.DedupePlugin()
limitChunkCount      = new webpack.optimize.LimitChunkCountPlugin({maxChunks: 10})
minChunkSize         = new webpack.optimize.MinChunkSizePlugin({minChunkSize: 10000})
occurenceOrderPlugin = new webpack.optimize.OccurenceOrderPlugin()

plugins = [
    cleanWebpackPlugin,
    htmlWebpackPlugin,
    assetsPlugin,
    dedupePlugin,
    limitChunkCount,
    minChunkSize,
    occurenceOrderPlugin,
    setNODE_ENV,
    moveFilesToTargetPlugin,
    webpackSHAHash,
    #extractCSS,
    #copyWebpackPlugin
]

if NODE_ENV != DEVEL
    plugins.push new webpack.optimize.UglifyJsPlugin
                            minimize:true
                            comments:false
                            mangle:
                                except: ['$super', '$', 'exports', 'require']

hashname = 'name=[path][name].[ext]?[sha1:hash:base64:10]'

module.exports =
    cache: true

    entry:
        js : 'js.coffee'
        vendors : ['react', 'async', 'events', 'marked', 'redux', 'react-redux', 'react-timeago', 'react-bootstrap',
                   'sha1', 'underscore', 'immutable', 'react-dropzone-component', 'jquery.payment',
                   'react-widgets/lib/Combobox', 'react-widgets/lib/DateTimePicker', 'md5',
                   './smc-webapp/codemirror/codemirror.coffee' ]
        smc : 'index.coffee'

    output:
        path          : OUTPUT
        publicPath    : path.join(BASE_URL, OUTPUT)
        filename      : '[name]-[hash].js'
        chunkFilename : '[name]-[id]-[hash].js'

    module:
        loaders: [
            { test: /\.cjsx$/,   loaders: ['coffee', 'cjsx'] },
            { test: /\.coffee$/, loader: 'coffee' },
            { test: /\.less$/,   loaders: ["style", "css", "less?#{cssConfig}"]},#loader : extractTextLess },
            { test: /\.scss$/,   loaders: ["style", "css", "sass?#{cssConfig}"]}, #loader : extractTextScss },
            { test: /\.sass$/,   loaders: ["style", "css", "sass?#{cssConfig}&indentedSyntax"]}, # loader : extractTextSass },
            { test: /\.json$/,   loaders: ['json'] },
            { test: /\.png$/,    loader: "url?limit=100000?mimetype=image/png&#{hashname}" },
            { test: /\.(jpg|gif)$/,    loader: "file"},
            { test: /\.html$/,   loader: "html"},
            { test: /\.woff(2)?(\?v=[0-9].[0-9].[0-9])?$/, loader: "url?mimetype=application/font-woff&#{hashname}" },
            { test: /\.(ttf|eot|svg)(\?v=[0-9].[0-9].[0-9])?$/, loader: "file?#{hashname}" },
            # { test: /\.css$/,    loader: 'style!css' },
            { test: /\.css$/, loaders: ["style", "css?#{cssConfig}"]}, # loader: extractTextCss },
        ]

    resolve:
        # So we can require('file') instead of require('file.coffee')
        extensions : ['', '.js', '.json', '.coffee', '.cjsx', '.scss', '.sass']
        root       : [path.resolve(__dirname),
                      path.resolve(__dirname, 'smc-util'),
                      path.resolve(__dirname, 'smc-util/node_modules'),
                      path.resolve(__dirname, 'smc-webapp'),
                      path.resolve(__dirname, 'smc-webapp/node_modules')]

    plugins: plugins

