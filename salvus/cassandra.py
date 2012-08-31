
import random, sha, uuid
import cql

NODES = []
last_node = -1

# TODO: If possible, maybe this should get updated periodically using
# nodetool (?), in case new nodes are added or removed.

def set_nodes(nodes):
    """input is a list of the cassandra nodes in the cluster"""
    global NODES, last_node
    NODES = nodes
    last_node = random.randrange(len(NODES))

# NOTE: There is no multi-host connection pool support at all in the cql python library as of Aug 2012:
#      http://www.mail-archive.com/user@cassandra.apache.org/msg24312.html
# We just use random robin here for now.
def get_node():
    global NODES, last_node
    if len(NODES) == 0: raise RuntimeError("there are no cassandra nodes")
    last_node = (last_node + 1)%len(NODES)
    return NODES[last_node]

def time_to_timestamp(t):
    """Convert a Python time.time()-style value (seconds since Epoch) to milliseconds since Epoch."""
    return int(t*1000)

def timestamp_to_time(t):
    """Convert a Cassandra timestamp to the same units as Python's time.time() returns, which is seconds since the Epoch."""
    return float(t)/1000

def connect(keyspace='salvus'):
    for i in range(len(NODES)):
        try:
            return cql.connect(get_node(), keyspace=keyspace, cql_version='3.0.0')
        except Exception, msg:
            print msg  # TODO -- logger
    raise RuntimeError("no cassandra nodes are up!! (selecting from %s)"%NODES)

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

def create_sage_servers_table(cursor):
    """Create table that tracks Sage servers."""
    cursor.execute("""
CREATE TABLE sage_servers (
    address varchar PRIMARY KEY,
    running boolean
)""")
    # index so we can search for which services are currently running
    cursor.execute("""
CREATE INDEX ON sage_servers (running);
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
        create_sage_servers_tables(cursor)
        

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
# Sage servers
##########################################################################

from admin import SAGE_PORT
def get_sage_servers():
    cur = cursor()
    cur.execute("SELECT address FROM sage_servers WHERE running='true'")
    return [(address[0], SAGE_PORT) for address in cur]

def record_that_sage_server_started(address):
    cursor().execute("UPDATE sage_servers SET running = 'true' WHERE address = :address", {'address':address})

def record_that_sage_server_stopped(address):
    cursor().execute("UPDATE sage_servers SET running = 'false' WHERE address= :address", {'address':address})
    
    
    
