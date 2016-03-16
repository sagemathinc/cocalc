###
Webpack configuration file

Run dev server with source maps:

    npm run webpack-watch

Then visit (say)

    https://dev0.sagemath.com/

or for smc-in-smc project, info.py URL, e.g.

    https://cloud.sagemath.com/14eed217-2d3c-4975-a381-b69edcb40e0e/port/56754/

This is far from ready to use yet, e.g., we need to properly serve primus websockets, etc.:

    webpack-dev-server --port=9000 -d

Resources for learning webpack:

    - https://github.com/petehunt/webpack-howto
    - http://webpack.github.io/docs/tutorials/getting-started/

###
'use strict';

_             = require('lodash')
webpack       = require('webpack')
path          = require('path')
fs            = require('fs')
glob          = require('glob')
child_process = require('child_process')

git_head    = child_process.execSync("git rev-parse --short HEAD")
SMC_VERSION = git_head.toString().trim()
WEBAPP_LIB  = 'webapp-lib'
INPUT       = path.resolve(__dirname, WEBAPP_LIB)
OUTPUT      = "static"
DEVEL       = "development"
NODE_ENV    = process.env.NODE_ENV || DEVEL
dateISO     = new Date().toISOString()

# create a file base_url to set a base url
BASE_URL = if fs.existsSync('data/base_url') then fs.readFileSync('data/base_url').toString().trim() + "/" else ''
console.log "NODE_ENV=#{NODE_ENV}"
console.log "BASE_URL='#{BASE_URL}'"
console.log "INPUT='#{INPUT}'"
console.log "OUTPUT='#{OUTPUT}'"

# mathjax version → symlink with version info from package.json/version
MATHJAX_DIR = 'smc-webapp/node_modules/mathjax'
MATHJAX_VERS = JSON.parse(fs.readFileSync("#{MATHJAX_DIR}/package.json", 'utf8')).version
MATHJAX_ROOT = path.join(OUTPUT, "mathjax-#{MATHJAX_VERS}")
MATHJAX_URL  = path.join(BASE_URL, MATHJAX_ROOT, 'MathJax.js')
console.log "MATHJAX_ROOT='#{MATHJAX_ROOT}'"
console.log "MATHJAX_URL='#{MATHJAX_URL}'"

# webpack plugin to do the linking after it's "done"
class MathjaxVersionedSymlink

MathjaxVersionedSymlink.prototype.apply = (compiler) ->
    compiler.plugin "done", (compilation, cb) ->
        fs.exists MATHJAX_ROOT,  (exists, cb) ->
            if not exists
                fs.symlink("../#{MATHJAX_DIR}", MATHJAX_ROOT, cb)

mathjaxVersionedSymlink = new MathjaxVersionedSymlink()

# plugins

# deterministic hashing for assets
WebpackSHAHash = require('webpack-sha-hash')
webpackSHAHash = new WebpackSHAHash()

# cleanup like "make distclean"
CleanWebpackPlugin = require('clean-webpack-plugin')
cleanWebpackPlugin = new CleanWebpackPlugin [OUTPUT],
                                            verbose: true
                                            dry: false

# assets.json file
AssetsPlugin = require('assets-webpack-plugin')
assetsPlugin = new AssetsPlugin
                        filename   : "assets.json"
                        fullPath   : no
                        prettyPrint: true
                        metadata:
                            version: SMC_VERSION
                            date   : dateISO

# https://www.npmjs.com/package/html-webpack-plugin
HtmlWebpackPlugin = require('html-webpack-plugin')
# we need our own chunk sorter, because dependency doesn't work
smcChunkSorter = (a, b) ->
    order = ['css', 'lib', 'smc']
    if order.indexOf(a.names[0]) < order.indexOf(b.names[0])
        return -1
    else
        return 1

# https://github.com/kangax/html-minifier#options-quick-reference
htmlMinifyOpts =
    removeComments: true
    minifyJS : true
    minifyCSS : true
    collapseWhitespace : true
    conservativeCollapse : true

jade2html = new HtmlWebpackPlugin
                        date     : dateISO
                        title    : 'SageMathCloud'
                        mathjax  : MATHJAX_URL
                        filename : 'index.html'
                        chunksSortMode: smcChunkSorter
                        hash: false
                        template : path.join(INPUT, 'index.jade')
                        minify   : htmlMinifyOpts

# the following set of plugins renders the policy pages
# they do *not* depend on any of the chunks, but rather specify css and favicon dependencies
# via lodash's template syntax. e.g.: <%= require('!file!bootstrap-3.3.0/css/bootstrap.min.css') %>
policyPages = []
for pp in (x for x in glob.sync('webapp-lib/policies/*.html') when path.basename(x)[0] != '_')
    policyPages.push new HtmlWebpackPlugin
                        filename : "policies/#{path.basename(pp)}"
                        inject   : 'head'
                        favicon  : path.join(INPUT, 'favicon.ico')
                        template : pp
                        chunks   : []
                        minify   : htmlMinifyOpts

# https://webpack.github.io/docs/stylesheets.html
ExtractTextPlugin = require("extract-text-webpack-plugin")

# merge + minify of included CSS files
cssConfig = JSON.stringify(minimize: true, discardComments: {removeAll: true}, mergeLonghand: true, sourceMap: true)
extractCSS = new ExtractTextPlugin("styles-[hash].css")
extractTextCss  = ExtractTextPlugin.extract("style", "css?sourceMap&#{cssConfig}")
extractTextSass = ExtractTextPlugin.extract("style", "css?#{cssConfig}!sass?sourceMap&indentedSyntax")
extractTextScss = ExtractTextPlugin.extract("style", "css?#{cssConfig}!sass?sourceMap")
extractTextLess = ExtractTextPlugin.extract("style", "css?#{cssConfig}!less?sourceMap")

# custom plugin, to handle the quirky situation of extra *.html files
class LinkFilesIntoTargetPlugin
    constructor: (@files, @target) ->

LinkFilesIntoTargetPlugin.prototype.apply = (compiler) ->
    compiler.plugin "done", (comp) =>
        #console.log('compilation:', _.keys(comp.compilation))
        _.forEach @files, (fn) =>
            if fn[0] != '/'
                src = path.join(path.resolve(__dirname, INPUT), fn)
                dst = path.join(@target, fn)
            else
                src = fn
                fnrelative = fn[INPUT.length + 1 ..]
                dst = path.join(@target, fnrelative)
            dst = path.resolve(__dirname, dst)
            console.log("hard-linking file:", src, "→", dst)
            dst_dir = path.dirname(dst)
            if not fs.existsSync(dst_dir)
                fs.mkdir(dst_dir)
            fs.linkSync(src, dst) # mysteriously, that doesn't work

#policies = glob.sync(path.join(INPUT, 'policies', '*.html'))
#linkFilesIntoTargetPlugin = new LinkFilesToTargetPlugin(policies, OUTPUT)

###
CopyWebpackPlugin = require('copy-webpack-plugin')
copyWebpackPlugin = new CopyWebpackPlugin []
###

setNODE_ENV          = new webpack.DefinePlugin
                                'process.env' :
                                   'NODE_ENV' : JSON.stringify(NODE_ENV)
                                'MATHJAX_URL' : JSON.stringify(MATHJAX_URL)
                                'SMC_VERSION' : JSON.stringify(SMC_VERSION)
                                'BUILD_DATE'  : JSON.stringify(dateISO)

{StatsWriterPlugin} = require("webpack-stats-plugin")
statsWriterPlugin   = new StatsWriterPlugin(filename: "webpack-stats.json")


class PrintChunksPlugin

PrintChunksPlugin.prototype.apply = (compiler) ->
    compiler.plugin 'compilation', (compilation, params) ->
        compilation.plugin 'after-optimize-chunk-assets', (chunks) ->
            console.log(chunks.map (c) ->
                    id: c.id
                    name: c.name
                    includes: c.modules.map (m) ->  m.request
            )



#provideGlobals = new webpack.ProvidePlugin
#                                $: "jquery"
#                                jQuery: "jquery"

plugins = [
    cleanWebpackPlugin,
    #provideGlobals,
    setNODE_ENV,
    jade2html,
    #commonsChunkPlugin,
    assetsPlugin,
    extractCSS,
    #copyWebpackPlugin
    webpackSHAHash,
    statsWriterPlugin,
    #new PrintChunksPlugin(),
    mathjaxVersionedSymlink,
    #linkFilesIntoTargetPlugin,
]

plugins = plugins.concat(policyPages)

if NODE_ENV != DEVEL
    console.log "production mode: enabling compression"
    # https://webpack.github.io/docs/list-of-plugins.html#commonschunkplugin
    # plugins.push new webpack.optimize.CommonsChunkPlugin(name: "lib")
    plugins.push new webpack.optimize.DedupePlugin()
    plugins.push new webpack.optimize.OccurenceOrderPlugin()
    plugins.push new webpack.optimize.LimitChunkCountPlugin(maxChunks: 10)
    plugins.push new webpack.optimize.MinChunkSizePlugin(minChunkSize: 25600)
    plugins.push new webpack.optimize.UglifyJsPlugin
                                sourceMap: true
                                minimize:true
                                comments:false
                                output:
                                    comments: false
                                mangle:
                                    except: ['$super', '$', 'exports', 'require']
                                    screw_ie8: true
                                compress:
                                    screw_ie8: true
                                    warnings: false
                                    properties: true
                                    sequences: true
                                    dead_code: true
                                    conditionals: true
                                    comparisons: true
                                    evaluate: true
                                    booleans: true
                                    unused: true
                                    loops: true
                                    hoist_funs: true
                                    cascade: true
                                    if_return: true
                                    join_vars: true
                                    drop_debugger: true
                                    negate_iife: true
                                    unsafe: true
                                    side_effects: true


hashname    = '[path][name]-[sha256:hash:base64:10].[ext]'
pngconfig   = "name=#{hashname}&limit=2000&mimetype=image/png"
svgconfig   = "name=#{hashname}&limit=2000&mimetype=image/svg+xml"
icoconfig   = "name=#{hashname}&mimetype=image/x-icon"
woffconfig  = "name=#{hashname}&mimetype=application/font-woff"

module.exports =
    cache: true

    entry: # ATTN don't alter or add names here, without changing the sorting function above!
        css  : 'webapp-css.coffee'
        lib  : 'webapp-lib.coffee'
        smc  : 'smc-webapp.coffee'

    output:
        path          : OUTPUT
        publicPath    : path.join(BASE_URL, OUTPUT) + '/'
        filename      : '[name]-[hash].js'
        chunkFilename : '[id]-[hash].js'
        hashFunction  : 'sha256'

    module:
        loaders: [
            { test: /\.cjsx$/,   loaders: ['coffee-loader', 'cjsx-loader'] },
            { test: /\.coffee$/, loader: 'coffee-loader' },
            { test: /\.less$/,   loaders: ["style-loader", "css-loader", "less?#{cssConfig}"]}, #loader : extractTextLess }, # 
            { test: /\.scss$/,   loaders: ["style-loader", "css-loader", "sass?#{cssConfig}"]}, #loader : extractTextScss }, # 
            { test: /\.sass$/,   loaders: ["style-loader", "css-loader", "sass?#{cssConfig}&indentedSyntax"]}, # ,loader : extractTextSass }, # 
            { test: /\.json$/,   loaders: ['json-loader'] },
            { test: /\.png$/,    loader: "url-loader?#{pngconfig}" },
            { test: /\.ico$/,    loader: "file-loader?#{icoconfig}" },
            { test: /\.svg(\?v=[0-9].[0-9].[0-9])?$/,    loader: "url-loader?#{svgconfig}" },
            { test: /\.(jpg|gif)$/,    loader: "file-loader"},
            # .html only for files in smc-webapp!
            { test: /\.html$/, include: [ path.resolve(__dirname, 'smc-webapp') ], loader: "raw!html-minify"},
            { test: /\.hbs$/,    loader: "handlebars-loader" },
            { test: /\.woff(2)?(\?v=[0-9].[0-9].[0-9])?$/, loader: "url-loader?#{woffconfig}" },
            { test: /\.(ttf|eot)(\?v=[0-9].[0-9].[0-9])?$/, loader: "file-loader?name=#{hashname}" },
            # { test: /\.css$/,    loader: 'style!css' },
            { test: /\.css$/, loaders: ["style-loader", "css-loader?#{cssConfig}"]}, # loader: extractTextCss }, # 
            { test: /\.jade$/, loader: 'jade' },
        ]

    resolve:
        # So we can require('file') instead of require('file.coffee')
        extensions : ['', '.js', '.json', '.coffee', '.cjsx', '.scss', '.sass']
        root       : [path.resolve(__dirname),
                      path.resolve(__dirname, WEBAPP_LIB),
                      path.resolve(__dirname, 'smc-util'),
                      path.resolve(__dirname, 'smc-util/node_modules'),
                      path.resolve(__dirname, 'smc-webapp'),
                      path.resolve(__dirname, 'smc-webapp/node_modules')]

    plugins: plugins

    'html-minify-loader':
         empty: true        # KEEP empty attributes
         cdata: true        # KEEP CDATA from scripts
         comments: false