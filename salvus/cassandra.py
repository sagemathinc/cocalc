import md5    
import cql

HOST='127.0.0.1'   # TODO!

def keyspace_exists(con, keyspace):
    try:
        con.cursor().execute("use :keyspace", {"keyspace":keyspace})
        return True
    except cql.ProgrammingError:
        return False

def init_cassandra_schema():
    con = cql.connect(HOST, cql_version='3.0.0')
    cursor = con.cursor()
    if not keyspace_exists(con, 'salvus'):
        cursor.execute("""
CREATE KEYSPACE salvus WITH strategy_class='SimpleStrategy' AND strategy_options:replication_factor=3""")
        cursor.execute("USE salvus")
        # TODO: add columns for date time of exec and sage version
        # TODO: is varchar the right type -- maybe blob?
        cursor.execute("CREATE TABLE stateless_exec (hash varchar PRIMARY KEY, input varchar, output varchar)")

class StatelessExec(object):
    def __init__(self):
        self._con = cql.connect(HOST)
        
    def hash(self, input):
        return md5.md5(input).hexdigest()

    def __getitem__(self, input):
        cursor = self._con.cursor()
        cursor.execute("USE salvus")
        cursor.execute("SELECT input, output FROM stateless_exec WHERE hash=:hash LIMIT 1", {'hash':self.hash(input)})
        c = cursor.fetchone()
        if len(c) > 0 and c[0] == input:
            return c[1]
        
    def __setitem__(self, input, output):
        cursor = self._con.cursor()
        cursor.execute("USE salvus")
        cursor.execute("UPDATE stateless_exec SET input = :input, output = :output WHERE hash = :hash",
                       {'input':input, 'output':output, 'hash':self.hash(input)})
        
    

