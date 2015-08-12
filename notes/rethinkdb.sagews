%coffee

r=require('rethinkdb'); x={}; r.connect(db: 'smc', (err, c) -> console.log("done", err); x.c=c)
accounts = r.table("accounts")

x.c.close((err)->console.log("closed",err))



r.dbCreate('smc').run(x.c, console.log)

r.tableCreate('accounts').run(x.c, console.log)

r.table('accounts').run(x.c, (err,cursor) => cursor.each(console.log))

accounts = r.table("accounts")

accounts.insert(name:{first:'William',last:'Stein'}, id:'c26db83a-7fa2-44a4-832b-579c18fac65f', email_address:'wstein@sagemath.com').run(x.c, console.log)

accounts.insert(name:{first:'Test',last:'User'}, id:'4a5f0542-5873-4eed-a85c-a18c706e8bcd', email_address:'test@sagemath.com').run(x.c, console.log)

accounts.insert(name:{first:'A',last:'Test'}, id:'3702601d-9fbc-4e4e-b7ab-c10a79e34d3b', email_address:'foo@sagemath.com').run(x.c, console.log)

accounts.get('3702601d-9fbc-4e4e-b7ab-c10a79e34d3b').update(first:"Avery").run(x.c, console.log)

accounts.filter(last:'User').update(email_address:'user@sagemath.com').run(x.c,console.log)

accounts.filter(last:'User').update(image:new Buffer(1000000)).run(x.c,console.log)

accounts.count().run(x.c, console.log)


accounts.changes().run(x.c, (err, cursor) -> cursor.each(console.log))

accounts.changes(includeStates:true).run(x.c, (err, cursor) -> cursor.each(console.log))

# this doesn't work
#accounts.count().changes().run(x.c, (e,c)->console.log(e))


# An alternative driver with a connection pool and returns arrays by default -- basically what I would probably write:

# https://github.com/neumino/rethinkdbdash

r = require('rethinkdbdash')(); accounts = r.db('smc').table('accounts')

accounts.run(console.log)
accounts.changes(includeStates:true).run((err, cursor) -> cursor.each(console.log))


accounts.insert(id:'5502601d-9fbc-4e4e-b7ab-c10a79e34d3z', email_address:'000@sagemath.com').run(console.log)


accounts.run(cursor:true).then((cursor) -> cursor.each(console.log))

accounts.run(console.log)


### insert all the SMC users

v = fs.readFileSync("/home/salvus/test/accounts-2015-06-06").toString().split('\n').slice(3);v=v.slice(0,v.length-1);0;
f = (i) -> x = v[i].split('|'); return {email:x[0]?.trim(),first:x[3]?.trim(),last:x[2]?.trim(),id:x[1]?.trim()}
z = (f(i) for i in [0...v.length]);0;
accounts.delete().run(console.log)
d=new Date(); accounts.insert(z).run((e)->console.log("DONE",e,new Date() - d))

# regexp through all data (about 7 seconds):
d=new Date(); accounts.filter((user) -> user('email').match('gmail.com')).count().run((e,n)->console.log("DONE",e,n,new Date() - d))
# btw, I tried sharding the data to two nodes and this query then took half as long :-)

# specific key but not in index -- half second
d=new Date(); accounts.filter(email:'wstein@sagemath.com').run((e,n)->console.log("DONE",e,n,new Date() - d))

# specific key with secondary index -- instant, of course!
d=new Date(); accounts.indexCreate('email').run((e,n)->console.log("DONE",e,n,new Date() - d))
d=new Date(); accounts.getAll("wstein@sagemath.com", index:"email").run((e,n)->console.log("DONE",e,n,new Date() - d))

# contains:
d=new Date(); accounts.filter((user) -> user('email').contains('gmail.com')).count().run((e,n)->console.log("DONE",e,n,new Date() - d))

accounts.pluck("last").distinct().count().run(console.log)

# reading all the names from the whole database takes about 2 seconds...
d=new Date(); x={};accounts.pluck('first', 'last').run((e,f)->x.f=f;console.log(new Date() - d))









