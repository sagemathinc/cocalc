# Development Information

## Testing

_In general, run these command-line statements in the `salvus/` sub-directory._

Run whole test suite:

    npm test

Run just one file in continuous watching mode:

    mocha --reporter min -w test/misc-test.coffee

Which is probably ideal when you write tests or work on a specific file.

`min` is the minimal reporter and
other reporters are `dot`, `progress`, `nyan` or `json` - [for more see here](http://mochajs.org/)

### Coverage

    npm run coverage

This generates a text and html summary in the `salvus/coverage/` sub-directory for the server-side coffeescript code.

Client-side js/react coverage is not done yet.

---

### start all the other daemons by doing this in ipython, run from salvus/salvus

    cd salvus/salvus
    ipython

    [1]:  import admin; reload(admin); s = admin.Services('conf/deploy_local/'); s.start('all')


### Once things are running do this (also in salvus/salvus) to watch the coffeescript/css/html for changes and automatically build:

    ./w
