###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


"""
Python Data Model: interface to the Cassandra database, schema creation, wrapper objects.

IMPORTANT MAINTENANCE NOTES:

    * When writing CQL SELECT statements, always do something like
      'SELECT name, description... FROM' instead of 'SELECT * FROM'
      since this is far more maintainable.

    * The file cassandra.coffee implements a NodeJS interface to this
      same database.  If you change anything in this file (defaults,
      schemas, etc.), you may have to change something there too.  Be
      careful.  In practive, the code in cassandra.coffee is what is
      actually mainly *used* by Salvus (via the hub).

    * The actual is defined in db_schema.cql


(c) William Stein, University of Washington, 2012

"""


import json, random, sha, time as _time, uuid
import cql

KEYSPACE = "salvus"

NODES = []
last_node = -1

# TODO: If possible, maybe this should get updated periodically using
# nodetool (?), in case new nodes are added or removed.

def set_nodes(nodes):
    """input is a list of the cassandra nodes in the cluster"""
    global NODES, last_node, pool
    pool = {}
    NODES = nodes
    last_node = random.randrange(len(NODES)) if len(NODES) else -1

# NOTE: There is no multi-host connection pool support at all in the cql python library as of Aug 2012:
#      http://www.mail-archive.com/user@cassandra.apache.org/msg24312.html
# We just use round robin here for now.
def get_node():
    global NODES, last_node
    if len(NODES) == 0: raise RuntimeError("there are no cassandra nodes")
    last_node = (last_node + 1)%len(NODES)
    return NODES[last_node]

def time_to_timestamp(t):
    """Convert a Python time.time()-style value (seconds since Epoch) to milliseconds since Epoch."""
    return int(t*1000)

def timestamp_to_time(t):
    """Convert a Cassandra timestamp to the same units as Python's _time.time() returns, which is seconds since the Epoch."""
    return float(t)/1000

def time_to_ascii(t):
    """Convert a Python time.time()-style value to ascii."""
    s = _time.localtime(t)
    return _time.strftime("%Y-%m-%d %H:%M:%S", s)

def now():
    return Time(_time.time())

class Time(float):
    def __repr__(self):
        return time_to_ascii(self)
    def to_cassandra(self):
        return time_to_timestamp(self)


pool = {}
def connect(keyspace=None, use_cache=True, user=None, password=None):
    key = (keyspace, user)
    if keyspace is None:
        keyspace = KEYSPACE
    if use_cache and pool.has_key(key):
        return pool[key]
    for i in range(len(NODES)):
        try:
            node = get_node()
            con = cql.connect(node, keyspace=keyspace, cql_version='3.0.0', user=user, password=password)
            print "Connected to %s"%node
            pool[key] = con
            return con
        except Exception, msg:
            print msg  # TODO -- logger
    raise RuntimeError("no cassandra nodes are up!! (selecting from %s)"%NODES)

def cursor(keyspace=None, use_cache=True, user=None, password=None):
    if keyspace is None:
        keyspace = KEYSPACE
    return connect(keyspace=keyspace, use_cache=use_cache, user=user, password=password).cursor()

import signal
def cursor_execute(query, param_dict=None, keyspace=None, timeout=1, user=None, password=None):
    if keyspace is None:
        keyspace = KEYSPACE
    if param_dict is None: param_dict = {}
    for k, v in param_dict.iteritems():
        if hasattr(v, 'to_cassandra'):
            param_dict[k] = v.to_cassandra()
    def f(*a):
        raise KeyboardInterrupt
    try:
        signal.signal(signal.SIGALRM, f)
        signal.alarm(timeout)
        try:
            cur = cursor(keyspace=keyspace, user=user, password=password)
            cur.execute(query, param_dict)
        except (KeyboardInterrupt, Exception), msg:
            print msg
            cur = cursor(keyspace=keyspace, use_cache=False, user=user, password=password)
            cur.execute(query, param_dict)
    finally:
        signal.signal(signal.SIGALRM, signal.SIG_IGN)
    return cur


def keyspace_exists(keyspace):
    try:
        con = connect(keyspace="")
        con.cursor().execute("use " + keyspace)
        return True
    except cql.ProgrammingError:
        return False

def init_salvus_schema(keyspace=None):
    if keyspace is None:
        keyspace = KEYSPACE
    con = connect(keyspace='')
    cursor = con.cursor()
    if not keyspace_exists(keyspace):
        #cursor.execute("CREATE KEYSPACE %s WITH strategy_class = 'SimpleStrategy' and strategy_options:replication_factor=3"%keyspace)
        cursor.execute("CREATE KEYSPACE %s WITH REPLICATION = {'class' : 'NetworkTopologyStrategy', 'DC0' : 1, 'DC1' : 1}"%keyspace)
    cursor.execute("USE %s"%keyspace)
    for s in open('db_schema.cql').read().split('CREATE'):
        if s:
            cql = "CREATE " + s
            print cql
            try:
                cursor.execute(cql)
            except Exception, msg:
                if 'already existing column family' not in str(msg) and 'Index already exists' not in str(msg):
                    print msg
                    print cql
    # TODO: used right now for account creation, but not actually used or meaningful (it used to be a year ago...)
    cursor.execute("UPDATE plans SET current=true, name='Free', session_limit=3, storage_limit=250, max_session_time=30, ram_limit=2000, support_level='None' WHERE plan_id=13814000-1dd2-11b2-0000-fe8ebeead9df")


##############################
# Conversion to and from JSON
##############################
def to_json(x):
    # this format is very important for compatibility with the node client
    return json.dumps(x, separators=(',',':'))

def from_json(x):
    return json.loads(x)


##########################################################################
# Base class for wrapper objects around database objects
##########################################################################
class DBObject(object):
    def __repr__(self):
        return '<%s: %s>'%(str(type(self)).split('.')[-1].split("'")[0], self.__dict__)


##########################################################################
# Account Plans -- free, pro, banned, etc.
# We keep a timestamp with each, so that the definition of "free" can
# change easily over time.
##########################################################################
class Plans(DBObject):
    """
    The collection of all account plans.

    EXAMPLES:

plans = cassandra.Plans()
free = plans.create_plan('free')
plans.plan(free.plan_id).plan_id == free.plan_id
free.data = "First free plan."
free.save()

free2 = plans.create_plan('free')
free2.data = "New improved free plan."
free2.save()
plans.newest_plan('free').data
    u'New improved free plan.'

free2.number_of_accounts_with_this_plan()
    0

    """
    def create_plan(self, name):
        """
        Create a new account plan with a given name with timestamp right
        now and save in database. Nothing else about the plan is initialized.
        """
        plan = Plan(uuid.uuid4())
        plan.name = name
        plan.save()
        cursor_execute("UPDATE newest_plans SET  plan_id = :plan_id WHERE name = :name",
                       {'name':name, 'plan_id':plan.plan_id})
        return plan

    def plan(self, plan_id):
        """Return the plan with the given id."""
        return Plan(plan_id)

    def newest_plan(self, name):
        """Return newest plan in database with this name, or return None if there are none with this name."""
        c = cursor_execute("SELECT plan_id FROM newest_plans WHERE name = :name", {'name':name}).fetchone()
        if c is not None:
            return Plan(c[0])

class Plan(DBObject):
    """
    A specific account plan.
    """
    def __init__(self, plan_id, data=None):
        """Constructed from the id. On creation we always query the DB for the details of this plan and fill them in."""
        self.plan_id = plan_id
        # query and fill in fields
        c = cursor_execute("SELECT name, data, time FROM plans WHERE plan_id = :plan_id", {'plan_id':plan_id}).fetchone()
        if c is not None:
            self.name = c[0]
            self.data = from_json(c[1])
            self.time = Time(c[2])
        else:
            self.name = ''
            self.data = data
            self.time = now()

    def save(self):
        # save possibly modified object to database
        cursor_execute("UPDATE plans SET name = :name, data = :data, time = :time WHERE plan_id = :plan_id",
                       {'name':self.name, 'data':to_json(self.data),
                        'time':self.time, 'plan_id':self.plan_id})

    def number_of_accounts_with_this_plan(self):
        return cursor_execute("SELECT COUNT(*) FROM accounts WHERE plan_id = :plan_id",
                       {'plan_id':self.plan_id}).fetchone()[0]


##########################################################################
# User Accounts
##########################################################################

class Accounts(DBObject):
    """
    Collection of all user accounts.

accounts = cassandra.Accounts(); a = accounts.create_account(); a.username = 'salvus'; a.save()

    """
    def create_account(self):
        account = Account(uuid.uuid4())
        account.save()
        return account

    def account_from_id(self, account_id):
        """Return the account with given id."""
        return Account(account_id)

    def accounts_with_email(self, email):
        """Return a list of all accounts that have the given email address."""
        return [Account(account_id=e[0]) for e in cursor_execute("SELECT account_id FROM accounts WHERE email = :email", {'email':email})]

    def accounts_with_auth(self, provider, login_name):
        """Return a list of all accounts that have the given auth provider and login_name."""
        c = cursor_execute("SELECT account_id FROM auths WHERE provider = :provider AND login_name = :login_name",
                           {'provider':provider, 'login_name':login_name})
        return [Account(account_id=e[0]) for e in c]

    def accounts_with_username(self, username):
        """Return a list of all accounts that have the given username."""
        c = cursor_execute("SELECT account_id FROM accounts WHERE username = :username", {'username':username})
        return [Account(account_id=e[0]) for e in c]

    def number_of_accounts(self):
        return cursor_execute("SELECT COUNT(*) FROM accounts").fetchone()[0]

    __len__ = number_of_accounts

    def ids_of_accounts_with_event_in_last_n_seconds(self, n):
        """1 week: n = 60*60*24*7"""
        return set([x[0] for x in cursor_execute("SELECT account_id FROM account_events WHERE time >= :time",
                                   {'time':Time(_time.time()-n)})])


class Account(DBObject):
    """A specific user account."""
    def __init__(self, account_id):
        self.account_id = account_id

        c = cursor_execute("SELECT creation_time, username, passwd_hash, email, plan_id, plan_starttime, prefs FROM accounts WHERE account_id = :account_id",
                           {'account_id':account_id}).fetchone()
        if c is not None:
            self.creation_time = Time(c[0])
            self.username = c[1]
            self.passwd_hash = c[2]
            self.email = c[3]
            self.plan_id = c[4]
            self.plan_starttime = Time(c[5])
            self.prefs = from_json(c[6])
        else:
            # the defaults
            self.creation_time = now()
            self.username = ''
            self.passwd_hash = ''
            self.email = ''
            self.plan_id = Plans().newest_plan('free').plan_id
            self.plan_starttime = now()
            self.prefs = {}

    def events(self, max_age=None):
        """
        Return list of all events for this account that are at most
        max_age seconds old, or return all events if max_age not
        specified.
        """
        if max_age is None:
            c = cursor_execute("SELECT time, event, value FROM account_events WHERE account_id = :account_id", {'account_id':self.account_id})
        else:
            min_time = Time(_time.time() - max_age)
            c = cursor_execute("SELECT time, event, value FROM account_events WHERE account_id = :account_id AND time >= :min_time",
                               {'account_id':self.account_id, 'min_time':min_time})
        return [AccountEvent(account_id=self.account_id, time=e[0], event=e[1], value=from_json(e[2])) for e in c]

    def create_event(self, event, value=''):
        """Create a new event for this account with type "event" and given value, which is stored as a JSON object, then return the event."""
        x = AccountEvent(self.account_id, time=now(), event=event, value=value)
        x.save()
        return x

    def plan(self):
        return Plan(self.plan_id)

    def auths(self):
        """Return a list of the 3rd part authentication accounts linked to this account."""
        c = cursor_execute("SELECT provider, login_name, info FROM auths WHERE account_id = :account_id", {'account_id':self.account_id})
        return [Auth(self.account_id, provider=x[0], login_name=x[1], info=from_json(x[2])) for x in c]

    def create_auth(self, provider, login_name, info):
        a = Auth(self.account_id, provider=provider, login_name=login_name, info=info)
        a.save()
        return a

    def save(self):
        # save possibly modified account to the database
        opts = {'account_id':self.account_id, 'creation_time':time_to_timestamp(self.creation_time),
                'username':self.username, 'passwd_hash':self.passwd_hash,
                'email':self.email,'prefs':to_json(self.prefs),
                'plan_id':self.plan_id, 'plan_starttime':time_to_timestamp(self.plan_starttime)}
        cursor_execute("UPDATE accounts SET creation_time = :creation_time, username = :username, passwd_hash = :passwd_hash, email = :email, plan_id = :plan_id, plan_starttime = :plan_starttime, prefs = :prefs WHERE account_id = :account_id", opts)

    def delete(self):
        # complete deletes this account from the database -- *use with care*.
        # also deletes the corresponding events, auths, etc. linked with this account.
        cursor_execute("DELETE FROM account_events WHERE account_id = :account_id", {'account_id':self.account_id})
        cursor_execute("DELETE FROM auths WHERE account_id = :account_id", {'account_id':self.account_id})
        cursor_execute("DELETE FROM accounts WHERE account_id = :account_id", {'account_id':self.account_id})


##########################################################################
# Auth -- third party authentication data linked to an account
##########################################################################
class Auth(DBObject):
    def __init__(self, account_id, provider, login_name, info):
        self.account_id = account_id
        self.provider = provider
        self.login_name = login_name
        self.info = info

    def save(self):
        cursor_execute("UPDATE auths SET info = :info WHERE account_id = :account_id AND provider = :provider AND login_name = :login_name",
                       {'info':to_json(self.info), 'login_name':self.login_name, 'provider':self.provider, 'account_id':self.account_id})


##########################################################################
# User Accounts Events:
# a generic way of storing events (e.g., login (and from where), logout,
# agree to terms of use, pay money, etc.) for a user.  This is meant to
# never have anything deleted from it.
##########################################################################

class AccountEvent(DBObject):
    """Simple wrapper class for an event."""
    def __init__(self, account_id=None, time=None, event=None, value=None):
        self.account_id = account_id
        self.time = Time(time); self.event = event; self.value = value

    def save(self):
        cursor_execute("UPDATE account_events SET event = :event, value = :value WHERE account_id = :account_id AND time = :time",
                       {'account_id':self.account_id, 'time':self.time, 'event':self.event, 'value':to_json(self.value)})



##########################################################################
# uuid : JSON value   store
##########################################################################
class UUIDValueStore(object):
    def __init__(self, name):
        self._name = name

    def __len__(self):
        return cursor_execute("SELECT COUNT(*) FROM key_value WHERE name = :name", {'name':self._name}).fetchone()[0]

    def __getitem__(self, uuid):
        c = cursor_execute("SELECT value FROM uuid_value WHERE name = :name AND uuid = :uuid LIMIT 1",
                           {'name':self._name, 'uuid':uuid}).fetchone()
        return from_json(c[0]) if c else None

    def __setitem__(self, uuid, value):
        if value is None:
            del self[uuid]
        else:
            self.set(uuid, value)

    def set(self, uuid, value, ttl=0):
        cursor_execute("UPDATE uuid_value USING TTL :ttl SET value = :value WHERE name = :name and uuid = :uuid",
                       {'value':to_json(value), 'name':self._name, 'uuid':uuid, 'ttl':ttl})

    def __delitem__(self, uuid):
        cursor_execute("DELETE FROM uuid_value WHERE name = :name AND uuid = :uuid", {'name':self._name, 'uuid':uuid})

    def delete_all(self):
        cursor_execute("DELETE FROM uuid_value WHERE name = :name", {'name':self._name})


##########################################################################
# JSON key : JSON value  store
##########################################################################
class KeyValueStore(object):
    def __init__(self, name):
        self._name = name

    def __len__(self):
        return cursor_execute("SELECT COUNT(*) FROM key_value WHERE name = :name", {'name':self._name}).fetchone()[0]

    def _to_json(self, x):
        return json.dumps(x, separators=(',',':'))

    def __getitem__(self, key):
        c = cursor_execute("SELECT value FROM key_value WHERE name = :name AND key = :key LIMIT 1",
                           {'name':self._name, 'key':to_json(key)}).fetchone()
        return from_json(c[0]) if c else None

    def __setitem__(self, key, value):
        if value is None:
            del self[key]
        else:
            self.set(key, value)

    def set(self, key, value, ttl=0):
        cursor_execute("UPDATE key_value USING TTL :ttl SET value = :value WHERE name = :name and key = :key",
                       {'value':to_json(value), 'name':self._name, 'key':to_json(key), 'ttl':ttl})

    def __delitem__(self, key):
        cursor_execute("DELETE FROM key_value WHERE name = :name AND key = :key",
                       {'name':self._name, 'key':to_json(key)})

    def delete_all(self):
        cursor_execute("DELETE FROM key_value WHERE name = :name", {'name':self._name})



##########################################################################

import cPickle

class StatelessExec(object):
    def hash(self, input):
        return sha.sha(input).hexdigest()

    def __getitem__(self, input):
        c = cursor_execute("SELECT output FROM stateless_exec WHERE input=:input LIMIT 1",
                 {'input':input}).fetchone()
        if c is not None and len(c) > 0 and c[0] == input:
            return cPickle.loads(str(c[1]))

    def __setitem__(self, input, output):
        cursor_execute("UPDATE stateless_exec SET output = :output WHERE input = :input",
                       {'input':input, 'output':cPickle.dumps(output)})


##########################################################################
# Compute servers
##########################################################################

def running_compute_servers():
    return [host[0] for host in cursor_execute("SELECT host FROM compute_servers WHERE running='true'")]

def record_that_compute_server_started(host):
    cursor().execute("UPDATE compute_servers SET running = 'true', score=0 WHERE host = :host", {'host':host})

def record_that_compute_server_stopped(host):
    cursor().execute("UPDATE compute_servers SET running = 'false', score=0 WHERE host= :host", {'host':host})

def tokens(n):
    RING_SIZE = 2**127
    return [RING_SIZE / n * x for x in range(n)]


##########################################################################
# One off maintenance tasks, which may be useful as templates, etc.
##########################################################################
def july14_snap_commits_update(keep_server_id, repo_id):
    # Delete every entry in the snap_commits table that doesn't
    # have the given keep_server_id.
    # For those that do, set their repo_id field.
    # Also, discard size; it's not useful as recorded.
    c = cursor()
    i = 0
    for commit in cursor_execute("SELECT server_id, project_id, timestamp, size FROM snap_commits LIMIT 1000000"):
        print commit
        server_id = commit[0]
        project_id = commit[1]
        timestamp = commit[2]
        print i, server_id, project_id, timestamp
        i += 1

        q = "DELETE FROM snap_commits WHERE server_id=%s AND project_id=%s AND timestamp='%s'"%(server_id, project_id, timestamp)
        print q
        if not c.execute(str(q)):
            print "error"
            break
        print server_id, type(server_id), keep_server_id
        if str(server_id) == keep_server_id:
            q = "UPDATE snap_commits SET repo_id=%s WHERE server_id=%s AND project_id=%s AND timestamp='%s'"%(repo_id, server_id, project_id, timestamp)
            print q
            if not c.execute(str(q)):
                print "error"
                break

def july14_delete_old_snap_commits(cutoff):
    c = cursor()
    i = 0
    for commit in cursor_execute("SELECT server_id, project_id, timestamp, repo_id FROM snap_commits LIMIT 1000000"):
        print commit
        server_id = commit[0]
        project_id = commit[1]
        timestamp = commit[2]
        print i, server_id, project_id, timestamp
        i += 1
        if timestamp < cutoff:
            q = "DELETE FROM snap_commits WHERE server_id=%s AND project_id=%s AND timestamp='%s'"%(server_id, project_id, timestamp)
            print q
            if not c.execute(str(q)):
                print "error"
                break








