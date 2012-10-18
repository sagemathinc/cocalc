helenus = require('helenus')

h = ['10.1.1.2',' 10.1.2.2', '10.1.3.2', '10.1.4.2', '10.4.1.2', '10.4.1.3', '10.4.2.2', '10.4.2.3']

pool = new helenus.ConnectionPool(
    hosts: h,
    keyspace: 'salvus', timeout: 3000, cqlVersion: '3.0.0')

pool.on('error', (err) -> console.error(err.name, err.message))

num_inputs = (cb) ->
    pool.cql("SELECT count(*) FROM stateless_exec", [], (err, results) ->
        cb(results[0][0].value))

sage_servers = (cb) -> 
    pool.cql("SELECT * FROM sage_servers", [], (err, results) -> cb(results))

pool.connect( (err,keyspace) ->
    if err
        throw(err)
    else
        sage_servers((s) ->
            for x in s
                console.log(x.get('address').value, x.get('running').value)
        )
        num_inputs((n) -> console.log(n))
)

