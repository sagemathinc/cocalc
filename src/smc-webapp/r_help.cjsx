##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
# Help Page
###

if global['BACKEND']  # set in ./render.coffee
    BASE_URL = require('smc-util/theme').DOMAIN_NAME
else
    # browser
    {BASE_URL} = require('./misc_page')

$ = window.$
misc = require('smc-util/misc')
{React, ReactDOM, redux, rtypes, rclass} = require('./app-framework')
{Well, Col, Row, Accordion, Panel, ProgressBar, Table} = require('react-bootstrap')
{Icon, Loading, Space, TimeAgo, UNIT, Footer} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription, PolicyPricingPageUrl} = require('./customize')
{RECENT_TIMES, RECENT_TIMES_KEY} = require('smc-util/schema')
{COLORS, HELP_EMAIL, WIKI_URL, DOC_URL, TWITTER_HANDLE, LIVE_DEMO_REQUEST, SITE_NAME} = require('smc-util/theme')
{ComputeEnvironment} = require('./compute_environment')

# List item style
li_style = exports.li_style =
    lineHeight    : 'inherit'
    marginBottom  : '10px'

# improve understanding of large numbers
fmt_large = (num) ->
    num = parseInt(num)
    if localStorage.fmt_large
        return num.toLocaleString(undefined, {useGrouping:true, maximumSignificantDigits: 2})
    else
        return num.toLocaleString()
    #num += 31 * num + 7890
    # num.toLocaleString(undefined, {useGrouping:true, maximumSignificantDigits: 2})


HelpPageUsageSection = rclass
    reduxProps :
        server_stats :
            loading             : rtypes.bool.isRequired
            hub_servers         : rtypes.array
            time                : rtypes.object
            accounts            : rtypes.number
            projects            : rtypes.number
            accounts_created    : rtypes.object # {RECENT_TIMES.key → number, ...}
            projects_created    : rtypes.object # {RECENT_TIMES.key → number, ...}
            projects_edited     : rtypes.object # {RECENT_TIMES.key → number, ...}
            files_opened        : rtypes.object

    displayName : 'HelpPage-HelpPageUsageSection'

    getDefaultProps: ->
        loading : true

    number_of_active_users: ->
        if @props.hub_servers.length == 0
            0
        else
            (x.clients for x in @props.hub_servers).reduce((s,t) -> s+t)

    render_active_users_stats: ->
        if @props.loading
            <div> Live server stats <Loading /> </div>
        else
            n = @number_of_active_users()
            <div style={textAlign:'center'}>
                    Currently connected users
                <ProgressBar style={marginBottom:10}
                    now={Math.max(n / 12 , 45 / 8) }
                    label={"#{n} connected users"} />
            </div>

    render_active_projects_stats: ->
        n = @props.projects_edited?[RECENT_TIMES_KEY.active]
        <ProgressBar now={Math.max(n / 3, 60 / 2)} label={"#{n} projects being edited"} />

    timespan_keys: ->
        ['last_hour', 'last_day', 'last_week', 'last_month']

    recent_usage_stats_rows: ->
        stats = [
            ['Modified projects', @props.projects_edited],
            ['Created projects', @props.projects_created],
            ['Created accounts', @props.accounts_created]
        ]

        for stat in stats
            <tr key={stat[0]}>
                <th style={textAlign:'left'}>{stat[0]}</th>
                {
                    for k in @timespan_keys()
                        <td key={k}>
                            {fmt_large(stat[1]?[RECENT_TIMES_KEY[k]])}
                        </td>
                }
            </tr>

    render_filetype_stats_rows: ->
        stats = [
            ['Sage Worksheets',   'sagews'],
            ['Jupyter Notebooks', 'ipynb'],
            ['LaTeX Documents',   'tex'],
            ['Markdown Documents','md']
        ]
        #if DEBUG then console.log('@props.files_opened', @props.files_opened)
        for [name, ext] in stats
            <tr key={name}>
                <th style={textAlign:'left'}>{name}</th>
                {
                    for timespan in @timespan_keys()
                        k        = RECENT_TIMES_KEY[timespan]
                        total    = @props.files_opened?.total?[k]?[ext]    ? 0
                        #distinct = @props.files_opened?.distinct?[k]?[ext] ? 0
                        <td key={k}>
                            {fmt_large(total)}
                        </td>
                }
            </tr>

    render_recent_usage_stats: ->
        if @props.loading
            return
        <Table bordered condensed hover className='cc-help-stats-table'>
            <thead>
                <tr>
                    <th>past</th>
                    <th>hour</th>
                    <th>day</th>
                    <th>week</th>
                    <th>month</th>
                </tr>
            </thead>
            <tbody>
                {@recent_usage_stats_rows()}
                <tr><td colSpan={5}>&nbsp;</td></tr>
                <tr>
                    <th style={textAlign:'left'}>Edited files</th>
                    <td colSpan={4}>&nbsp;</td>
                </tr>
                {@render_filetype_stats_rows()}
            </tbody>
        </Table>

    render_historical_metrics: ->
        return  # disabled, due to being broken...
        <li key='usage_metrics' style={li_style}>
            <a target='_blank' href='https://cocalc.com/b97f6266-fe6f-4b40-bd88-9798994a04d1/raw/metrics/metrics.html'>
                <Icon name='area-chart' fixedWidth />Historical system metrics
            </a> &mdash; CPU usage, running projects and software instances, etc
        </li>

    render_when_updated: ->
        if @props.time
            <span style={fontSize: '9pt', marginLeft: '20px', color: '#666'}>
                updated <TimeAgo date={new Date(@props.time)} />
            </span>

    render: ->
        # TODO: I changed to the share link since the raw link is no longer support (XSS attacks).
        # Unfortunately, it *will* be stale until we improve how things work; the only workaround
        # is to sign into that project and manually edit something right now...
        <Col sm={12} md={6}>
            <h3>
                <Icon name='dashboard' /> Statistics
                {@render_when_updated()}
            </h3>
            <div>
                {@render_active_users_stats()}
                {### @render_active_projects_stats() ###}
                <div style={marginTop: 20, textAlign:'center'}>
                    Recent user activity
                </div>
                {@render_recent_usage_stats()}
                <Icon name='line-chart' fixedWidth />{' '}
                <a target='_blank' href='https://cocalc.com/7561f68d-3d97-4530-b97e-68af2fb4ed13/raw/stats.html'>
                More data...
                </a>
                <br/>
                {@render_historical_metrics()}
            </div>
        </Col>


SUPPORT_LINKS =
    email_help :
        commercial: true
        bold : true
        icon : 'envelope'
        href : 'mailto:' + HELP_EMAIL
        link : HELP_EMAIL
        text : 'Please include the URL link to the relevant project or file!'
    doc :
        icon : 'book'
        bold : true
        href : DOC_URL
        link : <span><SiteName/> manual</span>
    wiki :
        icon : 'question-circle'
        bold : true
        href : WIKI_URL
        link : <span><SiteName/> WIKI portal</span>
    teaching :
        icon : 'graduation-cap'
        href : 'https://doc.cocalc.com/teaching-instructors.html'
        link : <span>Instructor Guide: How to teach a course with <SiteName/></span>
    pricing :
        icon : 'money'
        href : PolicyPricingPageUrl
        link : 'Pricing and subscription options'
        commercial: true
    docker_image:
        icon : 'window-maximize'
        href : 'https://github.com/sagemathinc/cocalc/blob/master/src/dev/docker/README.md'
        link : <span>Docker image for offline usage</span>
    courses :
        icon : 'users'
        href : 'https://github.com/sagemathinc/cocalc/wiki/Teaching'
        link :  <span>Courses using <SiteName/></span>
    cocalc_api :
        icon : 'gears'
        href : "#{BASE_URL}/doc/api.html"
        link :  <span><SiteName/> API</span>
    live_demo :
        icon : 'comments-o'
        link : "Request a live demo about how to teach a course"
        href : LIVE_DEMO_REQUEST

CONNECT_LINKS =
    share :
        bold : true
        icon : 'bullhorn'
        href : "#{BASE_URL}/share"
        link : 'Shared public files'
    support_mailing_list :
        icon : 'list-alt'
        href : 'https://groups.google.com/forum/?fromgroups#!forum/cocalc'
        link : <span>Mailing list</span>
    sagemath_blog :
        icon : 'rss'
        href : 'http://blog.sagemath.com/'
        link : 'News and updates on our blog'
    twitter :
        icon : 'twitter-square'
        href : "https://twitter.com/#{TWITTER_HANDLE}"
        link : "Follow @#{TWITTER_HANDLE} on twitter"
    facebook :
        icon : 'facebook-square'
        href : 'https://www.facebook.com/CoCalcOnline/'
        link : 'Like our facebook page'
    google_plus :
        icon : 'google-plus-square'
        href : 'https://plus.google.com/117696122667171964473/posts'
        link : <span>+1 our Google+ page</span>
    github :
        icon : 'github-square'
        href : 'https://github.com/sagemathinc/cocalc'
        link : 'GitHub'
        text : <span>
                 <a href='https://github.com/sagemathinc/cocalc/tree/master/src' target='_blank' rel='noopener'>source code</a>,{' '}
                 <a href='https://github.com/sagemathinc/cocalc/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aopen%20label%3AI-bug%20sort%3Acreated-asc%20-label%3Ablocked' target='_blank' rel='noopener'>bugs</a>
                 {' and '}
                 <a href='https://github.com/sagemathinc/cocalc/issues' target='_blank' rel='noopener'>issues</a>
               </span>

THIRD_PARTY =
    sagemath :
        icon : 'cc-icon-sagemath'
        href : 'http://www.sagemath.org/'
        link : 'SageMath'
        text : <span>open-source mathematical software</span>
    r :
        icon : 'cc-icon-r'
        href : 'https://cran.r-project.org/doc/manuals/r-release/R-intro.html'
        link : 'R project'
        text : 'the #1 open-source statistics software'
    python :
        icon : 'cc-icon-python'
        href : 'http://www.scipy-lectures.org/'
        link : 'Scientific Python'
        text : <span>i.e.{' '}
                    <a href='http://statsmodels.sourceforge.net/stable/' target='_blank' rel='noopener'>Statsmodels</a>,{' '}
                    <a href='http://pandas.pydata.org/pandas-docs/stable/' target='_blank' rel='noopener'>Pandas</a>,{' '}
                    <a href='http://docs.sympy.org/latest/index.html' target='_blank' rel='noopener'>SymPy</a>,{' '}
                    <a href='http://scikit-learn.org/stable/documentation.html' target='_blank' rel='noopener'>Scikit Learn</a>,{' '}
                    <a href='http://www.nltk.org/' target='_blank' rel='noopener'>NLTK</a> and many more
               </span>
    julia :
        icon : 'cc-icon-julia'
        href : 'http://docs.julialang.org/en/stable/manual/introduction/'
        link : 'Julia'
        text : 'programming language for numerical computing'
    octave :
        icon : 'cc-icon-octave'
        href : 'https://www.gnu.org/software/octave/'
        link : 'GNU Octave'
        text : 'scientific programming language, largely compatible with MATLAB'
    tensorflow :
        icon : 'lightbulb-o'
        href : 'https://www.tensorflow.org/get_started/get_started'
        link : 'Tensorflow'
        text : 'open-source software library for machine intelligence'
    latex :
        icon : 'cc-icon-tex-file'
        href : 'https://en.wikibooks.org/wiki/LaTeX'
        link : 'LaTeX'
        text : 'high-quality typesetting program'
    linux :
        icon : 'linux'
        href : 'http://ryanstutorials.net/linuxtutorial/'
        link : 'GNU/Linux'
        text : 'operating system and utility toolbox'


ABOUT_LINKS =
    legal :
        icon : 'cc-icon-section'
        link : 'Terms of Service, Pricing, Copyright and Privacy policies'
        href : "#{BASE_URL}/policies/index.html"
    developers :
        icon : 'keyboard-o'
        text : <span>
                <a target='_blank' rel='noopener' href='http://blog.sagemath.com/cocalc/2018/09/10/where-is-cocalc-from.html'>Core developers</a>: John Jeng,{' '}
                <a target='_blank' rel='noopener' href='http://harald.schil.ly/'>Harald Schilly</a>,{' '}
                <a target="_blank" rel='noopener' href='https://twitter.com/haldroid'>Hal Snyder</a>,{' '}
                <a target='_blank' rel='noopener' href='http://wstein.org'>William Stein</a>
               </span>
    #funding :
    #    <span>
    #        <SiteName/> currently funded by paying customers, private investment, and <a target='_blank' rel='noopener' href="https://cloud.google.com/developers/startups/">the Google startup program</a>
    #    </span>
    #launched :
    #    <span>
    #        <SiteName/> launched (as "SageMathCloud") April 2013 with support from the National Science Foundation and
    #        <a target='_blank' rel='noopener' href='https://research.google.com/university/relations/appengine/index.html'> the Google
    #        Education Grant program</a>
    #    </span>
    incorporated :
        icon : 'gavel'
        text : 'SageMath, Inc. (a Delaware C Corporation) was incorporated Feb 2, 2015'


LinkList = rclass
    displayName : 'HelpPage-LinkList'

    propTypes :
        title : rtypes.string.isRequired
        icon  : rtypes.string.isRequired
        links : rtypes.object.isRequired
        width : rtypes.number

    getDefaultProps: ->
        width : 6

    render_links: ->
        {commercial} = require('./customize')
        for name, data of @props.links
            if data.commercial and not commercial
                continue
            style = misc.copy(li_style)
            if data.bold
                style.fontWeight = 'bold'
            is_target_blank = data.href?.indexOf('#') != 0

            <div key={name} style={style} className={if data.className? then data.className}>
                <Icon name={data.icon} fixedWidth />{' '}
                { <a target={if is_target_blank then '_blank'} rel={if is_target_blank then 'noopener'}  href={data.href}>
                   {data.link}
                </a> if data.href}
                {<span style={color:COLORS.GRAY_D}>
                   {<span> &mdash; </span> if data.href }
                   {data.text}
                </span> if data.text}
            </div>

    render: ->
        <Col md={@props.width} sm={12}>
            {<h3> <Icon name={@props.icon} /> {@props.title}</h3> if @props.title}
            {@render_links()}
        </Col>

ThirdPartySoftware = rclass
    displayName : 'Help-ThirdPartySoftware'
    render: ->
        <LinkList title='Software' icon='question-circle' links={THIRD_PARTY} />

exports.render_static_third_party_software = ->
    <LinkList title='' icon='question-circle' width={12} links={THIRD_PARTY} />

exports.HelpPage = HelpPage = rclass
    displayName : 'HelpPage'

    render_compute_env: ->
        return <Row><ComputeEnvironment /></Row>

    render: ->
        banner_style =
            backgroundColor : 'white'
            padding         : '15px'
            border          : "1px solid #{COLORS.GRAY}"
            borderRadius    : '5px'
            margin          : '20px 0'
            width           : '100%'
            fontSize        : '115%'
            textAlign       : 'center'
            marginBottom    : '30px'

        {SmcWikiUrl}      = require('./customize')
        {ShowSupportLink} = require('./support')
        {APP_LOGO}        = require('./art')

        <Row style={padding:'10px', margin:'0px', overflow:'auto'}>
            <Col sm={10} smOffset={1} md={8} mdOffset={2} xs={12}>
                <h3 style={textAlign: 'center', marginBottom: '30px'}>
                <img src="#{APP_LOGO}" style={width:'33%', height:'auto'} />
                <br/>
                <SiteDescription/>
                </h3>

                <div style={banner_style}>
                    <Icon name='medkit'/><Space/><Space/>
                    <strong>In case of any questions or problems, <em>do not hesitate</em> to create a <ShowSupportLink />.</strong>
                    <br/>
                    We want to know if anything is broken!
                </div>

                <Row>
                    <LinkList title='Help and support' icon='support' links={SUPPORT_LINKS} />
                    <LinkList title='Connect' icon='plug' links={CONNECT_LINKS} />
                </Row>
                <Row style={marginTop:'20px'}>
                    <ThirdPartySoftware />
                    <HelpPageUsageSection />
                </Row>
                <Row>
                    {<LinkList title='About' icon='info-circle' links={ABOUT_LINKS} width={12} /> if require('./customize').commercial}
                </Row>
                {@render_compute_env()}
            </Col>
            <Col sm={1} md={2} xsHidden></Col>
            <Col xs={12} sm={12} md={12}>
                <Footer/>
            </Col>
        </Row>

exports.render_static_about = ->
    <Col>
        <Row>
            <LinkList title='Help & Support' icon='support' links={SUPPORT_LINKS} />
            <LinkList title='Connect' icon='plug' links={CONNECT_LINKS} />
        </Row>
        <Row style={marginTop:'20px'}>
            <ThirdPartySoftware />
            <HelpPageUsageSection store={{}} />
        </Row>
    </Col>

exports._test =
    HelpPageSupportSection : <LinkList title='Help & Support' icon='support' links={SUPPORT_LINKS} />
    ConnectSection : <LinkList title='Connect' icon='plug' links={CONNECT_LINKS} />
    SUPPORT_LINKS : SUPPORT_LINKS
    CONNECT_LINKS : CONNECT_LINKS

