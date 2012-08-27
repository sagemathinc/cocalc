import sha
import cql

HOST='127.0.0.1'   # TODO!

def time_to_timestamp(t):
    """Convert a Python time.time()-style value (seconds since Epoch) to milliseconds since Epoch."""
    return int(t*1000)

def timestamp_to_time(t):
    """Convert a Cassandra timestamp to the same units as Python's time.time() returns, which is seconds since the Epoch."""
    return float(t)/1000

def connect(keyspace='salvus'):
    return cql.connect(HOST, keyspace=keyspace, cql_version='3.0.0')

def cursor(keyspace='salvus'):
    return connect(keyspace=keyspace).cursor()

def keyspace_exists(con, keyspace):
    try:
        con.cursor().execute("use " + keyspace)
        return True
    except cql.ProgrammingError:
        return False

######################################
# create various tables
######################################        

def create_stateless_exec_table(cursor):
    # TODO: add columns for date time of exec and sage version
    # TODO: is varchar the right type -- maybe blob?
    cursor.execute("""
CREATE TABLE stateless_exec(
     hash varchar PRIMARY KEY,
     input varchar,
     output varchar)
""")

def create_services_table(cursor):
    """Create table that tracks registered components of salvus."""
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

    # index so we can search for which services are currently running
    cursor.execute("""
CREATE INDEX ON services (running);
    """)

    # index so we can search for all services of a given type
    cursor.execute("""
CREATE INDEX ON services (name);
    """)

def create_status_table(cursor):
    """Tracking status of registered components of salvus as they run."""
    cursor.execute("""
CREATE TABLE status (
    service_id uuid,
    time timestamp,
    pmem float,
    pcpu float,
    cputime float,
    vsize int,
    rss int,
    PRIMARY KEY(service_id, time)
)""")

def create_log_table(cursor):
    cursor.execute("""
CREATE TABLE log (
    service_id uuid,
    time timestamp,
    logfile varchar,
    message varchar,
    PRIMARY KEY(service_id, time))
""")
    

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
        create_log_table(cursor)
        

##########################################################################

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
        
    


##########################################################################

def get_sage_servers():
    cur = cursor()
    cur.execute("SELECT address, port FROM services WHERE running='true' and name='sage'")
    return list(cur)
