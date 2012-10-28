express  = require("express")
passport = require("passport")
util     = require("util")

GitHubStrategy       = require("passport-github").Strategy
GITHUB_CLIENT_ID     = "9ac84ec073088d11f210"
GITHUB_CLIENT_SECRET = "150bb5c6915d9a2bf7e52b6ffd9c032136ff3abb"

passport.serializeUser( (user, done) -> done(null, user) )

passport.deserializeUser( (obj, done) -> done(null, obj) )

passport.use(new GitHubStrategy({
        clientID: GITHUB_CLIENT_ID
        clientSecret: GITHUB_CLIENT_SECRET
        callbackURL: "http://127.0.0.1:3000/auth/github/callback"
    },
    (accessToken, refreshToken, profile, done) ->
        process.nextTick( () -> return done(null, profile) )
    )
)    

app = express()    
        
app.configure(() ->
    app.set("views", __dirname + '/views')
    app.set("view engine", "ejs")
    app.use(express.logger())
    app.use(express.cookieParser())
    app.use(express.bodyParser())
    app.use(express.methodOverride())
    app.use(express.session({secret:'salvus cat'}))
    
    app.use(passport.initialize())
    app.use(passport.session())
    app.use(app.router)

    app.use(express.static(__dirname + '/public'))
)    

app.get('/', (req, res) ->
    res.render('index', {user:req.user})
)    

app.get('/account', ensureAuthenticated, (req, res) ->
    res.render('account', {user:req.user})
)

app.get('/login', (req, res) ->
    res.render('login', {user:req.user})
)

app.get('/auth/github',
    passport.authenticate('github'),
    (req,res) -> # never called
)

app.get('/auth/github/callback',
    passport.authenticate('github', {failureRedirect:'/login'}),
    (req, res) -> res.redirect('/')
)

app.get('/logout', (req, res) ->
    req.logout()
    res.redirect('/')
)

app.listen(3000)
console.log("listening on port 3000")

ensureAuthenticated = (req, res, next) ->
    if (req.isAuthenticated())
        return next() 
    res.redirect('/login')