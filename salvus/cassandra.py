import md5    
import cql

HOST='127.0.0.1'   # replace by dynamic DNS balanching or something?

def keyspace_exists(con, keyspace):
    try:
        con.cursor().execute("use :keyspace", {"keyspace":keyspace})
        return True
    except cql.ProgrammingError:
        return False

def init_cassandra_schema():
    con = cql.connect(HOST)
    cursor = con.cursor()
    if not keyspace_exists(con, 'salvus'):
        cursor.execute("CREATE KEYSPACE salvus WITH strategy_class='SimpleStrategy' AND strategy_options:replication_factor=3")
        cursor.execute("USE salvus");
        cursor.execute("CREATE TABLE stateless_exec (md5 blob PRIMARY KEY, input varchar, output blob)")
        

class StatelessExec(object):
    def __init__(self):
        self._con = cql.connect(HOST)
        
    def hash(self, input):
        return md5.md5(input).digest()

    def __getitem__(self, input):
        cursor = self._con.cursor()
        c = cursor.execute("SELECT input, output FROM stateless_exec WHERE md5=:md5 LIMIT 1", {'md5':self.hash(key)}).fetchall()
        if len(c) > 0 and c[0][0] == input:
            return c[0][1]
        
    def __setitem__(self, key, result):
        # TODO!
        #key = key.strip()
        #self._async_cache.set(self.key(key), (key, result), callback=lambda data:None)
    

