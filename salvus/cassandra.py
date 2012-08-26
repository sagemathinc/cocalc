import sha
import cql

HOST='127.0.0.1'   # TODO!

def connect(keyspace='salvus'):
    return cql.connect(HOST, keyspace=keyspace, cql_version='3.0.0')

def keyspace_exists(con, keyspace):
    try:
        con.cursor().execute("use " + keyspace)
        return True
    except cql.ProgrammingError:
        return False

def create_stateless_exec_table(cursor):
    ######################################
    # stateless-execution cache:
    ######################################        
    # TODO: add columns for date time of exec and sage version
    # TODO: is varchar the right type -- maybe blob?
    cursor.execute("""
CREATE TABLE stateless_exec(
     hash varchar PRIMARY KEY,
     input varchar,
     output varchar)
""")

def create_services_table(cursor):
    ######################################
    # tracking registered components of salvus 
    ######################################        
    cursor.execute("""
CREATE TABLE services (
    service_id uuid PRIMARY KEY,
    name varchar,
    address varchar,
    port int,
    running boolean,
    username varchar,
    pid int,
    monitor_pid int,
)""")
    
    cursor.execute("""
CREATE INDEX services_running_idx ON services (running);
    """)
    

def create_status_table(cursor):
    ######################################
    # tracking registered components of salvus 
    ######################################        
    cursor.execute("""
CREATE TABLE status (

)""")

def init_cassandra_schema():
    con = connect(keyspace=None)
    cursor = con.cursor()
    if not keyspace_exists(con, 'salvus'):
        cursor.execute("""
CREATE KEYSPACE salvus WITH strategy_class='SimpleStrategy' AND strategy_options:replication_factor=3""")
        cursor.execute("USE salvus")
        create_stateless_exec_table(cursor)
        create_services_table(cursor)
        create_status_table(cursor)
        


import cPickle

class StatelessExec(object):
    def cursor(self):
        if not hasattr(self, '_con'):
            self._con = connect()
        return self._con.cursor() 
        
    def hash(self, input):
        return sha.sha(input).hexdigest()

    def __getitem__(self, input):
        cursor = self.cursor()
        cursor.execute("SELECT input, output FROM stateless_exec WHERE hash=:hash LIMIT 1", {'hash':self.hash(input)})
        c = cursor.fetchone()
        if c is not None and len(c) > 0 and c[0] == input:
            return cPickle.loads(str(c[1]))
        
    def __setitem__(self, input, output):
        cursor = self.cursor()
        cursor.execute("UPDATE stateless_exec SET input = :input, output = :output WHERE hash = :hash",
                       {'input':input, 'output':cPickle.dumps(output), 'hash':self.hash(input)})
        
    

