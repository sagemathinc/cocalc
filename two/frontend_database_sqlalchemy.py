"""
Frontend database implemented using SQLAlchemy

"""

####################################################
# SQLalchemy + SQLite local file
# This is only for the first small testing version.
# Later we'll support a more scalable database.
####################################################

from sqlalchemy import create_engine
#import random
#db_file = 'data/frontend-%s.sqlite'%(random.randint(0,100000000)) # for testing
db_file = 'data/frontend.sqlite'
engine = create_engine('sqlite:///%s'%db_file)

####################################################
# Declare the Schema
####################################################
from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()

from sqlalchemy import (Boolean, Column, DateTime, Float, Integer, String, ForeignKey)
from sqlalchemy.orm import relationship, backref

import time
def now():
    """
    EXAMPLES::

        >>> now() > 0
        True
        >>> type(now())
        <type 'float'>
        >>> time.localtime(now())
        time.struct_time(...)
        >>> time.asctime(time.localtime(now()))
        '... 201...'
    """
    return time.time()

def timestamp_to_str(timestamp):
    return time.asctime(time.localtime(timestamp))

class User(Base):
    """
    EXAMPLES::

        >>> drop_all(); create(); s = session()
        >>> u = User(); u
        <User None>
        >>> s.add(u); s.commit(); u
        <User 1>
        >>> u = User(); s.add(u); s.commit()
        >>> v = s.query(User).all()[1]; v
        <User 2>
    """
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    timestamp = Column(Float)
    def __init__(self):
        self.timestamp = now()
        
    def __repr__(self):
        return "<User %s>"%(self.id,)

class Account(Base):
    __tablename__ = "accounts"
    timestamp = Column(Float)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))

    host = Column(String)  # 'github', 'google', 'dropbox', etc. 
    auth = Column(String)  # authentication info (token, etc.)
    
    user = relationship("User", backref=backref('accounts', order_by=host))
    def __init__(self, host, auth):
        self.timestamp = now()
        self.host = str(host)
        self.auth = str(auth)

    def __repr__(self):
        return "<Account user_id=%s, host=%s, auth=%s>"%(
            self.user_id, self.host, self.auth)
                                                         

class UserPreferences(Base):
    __tablename__ = "user_preferences"
    timestamp = Column(Float)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    username = Column(String)
    email_address = Column(String)
    theme = Column(String)
    keyboard_shortcuts = Column(String)

    user = relationship("User", backref=backref('user_preferences', uselist=False))

    def __init__(self):
        self.timestamp = now()

    def __repr__(self):
        return '<User Preferences user_id=%s, username="%s", email_address="%s", theme="%s", keyboard_shortcuts="%s">'%(
            self.user_id, self.username, self.email_address, self.theme, self.keyboard_shortcuts)

class UserTracking(Base):
    __tablename__ = "user_tracking"
    id = Column(Integer, primary_key=True)
    timestamp = Column(Float)
    user_id = Column(Integer, ForeignKey('users.id'))
    resource = Column(String)
    data1 = Column(String)
    data2 = Column(String)
    
    user = relationship("User", backref=backref('tracking', order_by=resource))
    
    def __init__(self, resource, data1=None, data2=None):
        self.timestamp = now()
        self.resource = str(resource)
        if data1 is not None:
            self.data1 = str(data1)
        if data2 is not None:
            self.data2 = str(data2)

    def __repr__(self):
        return "<Track '%s': %s, %s, %s>"%(timestamp_to_str(self.timestamp),
                                            self.resource, self.data1, self.data2)
            
class Backend(Base):
    __tablename__ = "backends"
    id = Column(Integer, primary_key=True)
    timestamp = Column(Float)

    uri = Column(String)
    unix_user = Column(String)
    is_running = Column(Boolean)
    load_number = Column(Float)
    number_of_connected_users = Column(Integer)
    number_of_stored_workspaces = Column(Integer)
    disk_usage = Column(Integer)  # MB
    disk_available = Column(Integer) # MB
    
    def __init__(self):
        self.timestamp = now()

    def __repr__(self):
        return '<Backend %s: "%s">'%(self.id, self.uri)

class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True)
    title = Column(String)
    last_change = Column(Float)
    active_backend_id = Column(Integer)  # None if not active
    timestamp = Column(Float)
    
    def __init__(self, title):
        self.timestamp = now()
        self.last_change = now()
        self.title = str(title)

    def __repr__(self):
        return '<Workspace %s: "%s">'%(self.id, self.title)
    
class WorkspaceLocation(Base):
    __tablename__ = "workspace_locations"
    timestamp = Column(Float)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), primary_key=True)
    backend_id = Column(Integer, ForeignKey('backends.id'), primary_key=True)

    workspace = relationship("Workspace", backref=backref('locations', order_by=backend_id))
    backend = relationship("Backend", backref=backref('workspaces', order_by=workspace_id))
    
    def __init__(self, workspace, backend):
        self.timestamp = now()
        self.workspace = workspace
        self.backend = backend

    def __repr__(self):
        return "<Workspace %s at Backend %s>"%(self.workspace_id, self.backend_id)

class Permission(Base):
    __tablename__ = "permissions"
    timestamp = Column(Float)

    workspace_id = Column(Integer, ForeignKey('workspaces.id'), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    type = Column(String) # 'owner', 'collab', 'readonly', 'quiz', etc.

    workspace = relationship("Workspace", backref=backref("permissions"))
    user = relationship("User", backref=backref("permissions"))
    
    def __init__(self, workspace, user, type):
        self.timestamp = now()
        self.workspace = workspace
        self.user = user
        self.type = str(type)

    def __repr__(self):
        return "<Permission: User %s has permission '%s' for Workspace %s>"%(self.user.id, self.type, self.workspace.id)

class Publication(Base):
    __tablename__ = "publications"
    timestamp = Column(Float)
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'))
    commit_id = Column(String)
    main_filename = Column(String)
    published_timestamp = Column(Float)

    workspace = relationship("Workspace", backref=backref("publications"))
    
    def __init__(self, commit_id, main_filename, published_timestamp=None):
        self.main_filename = main_filename
        self.commit_id = commit_id
        self.published_timestamp = published_timestamp if not None else now()
        self.timestamp = now()

    def __repr__(self):
        return '<Publication of file "%s" from commit %s of Workspace %s -- %s>'%(
            self.main_filename, self.commit_id, self.workspace_id, timestamp_to_str(self.published_timestamp))

class AccountType(Base):
    __tablename__ = "account_types"
    timestamp = Column(Float)
    id = Column(Integer, primary_key=True)
    name = Column(String)
    description = Column(String)

    # parameters
    workspace_cpu_timeout = Column(Integer)
    workspace_wall_timeout = Column(Integer)
    max_processes = Column(Integer)
    max_MB_memory = Column(Integer)
    max_MB_disk_space = Column(Integer)
    allow_private_publications = Column(Boolean)
    max_users_per_workspace = Column(Integer)
    
    def __init__(self):
        self.timestamp = now()

    def __repr__(self):
        return '<Account Type "%s" -- %s>'%(self.name, self.description)

class Slave(Base):
    __tablename__ = "slaves"
    timestamp = Column(Float)

    id = Column(Integer, primary_key=True)
    URI = Column(String)
    last_update_timestamp = Column(Float)
    
    def __init__(self, URI):
        self.URI = URI
        self.timestamp = now()

    def __repr__(self):
        return "<Slave %s, last updated %s>"%(self.URI, timestamp_to_str(self.last_update_timestamp))
    


####################################################
# Working with the database
####################################################

def create():
    r"""
    Create the database.

    EXAMPLES::

    We first do a query before the database is created and get an
    error::

        >>> drop_all()
        >>> S = session()
        >>> S.query(User).count()
        Traceback (most recent call last):
        ...
        OperationalError: (OperationalError) no such table...

    After creating the DB, it works, and we get no records::

        >>> create()
        >>> S.query(User).count()
        0
    """
    Base.metadata.create_all(engine)


def session():
    """
    Return a database session.
    
    EXAMPLES::

        >>> session()
        <sqlalchemy.orm.session.Session...>
    """
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    return Session()

def drop_all():
    r"""
    Delete everything from the database.

    EXAMPLES::

    We delete everything, create the DB again, enter a record, confirm
    it is there, then delete everything, and confirm the record is
    gone::

        >>> drop_all()
        >>> create()
        >>> S = session()
        >>> S.add(User())
        >>> S.commit()
        >>> S.query(User).count()
        1
        >>> drop_all()
        >>> S = session()

    This query fails because we deleted all the tables::
    
        >>> S.query(User).count()
        Traceback (most recent call last):
        ...
        OperationalError: (OperationalError) no such table...
    """
    Base.metadata.drop_all(engine)



####################################################
# Testing Configurations
# Insert data in database to make it configured
# in various ways that are useful for testing.
####################################################

def testconf_1(num_users=1, num_backends=1, num_workspaces=1,
               num_locations=1, num_publications=1, num_slaves=3,
               verbose=True):
    """
    Put the database into a testing configuration by generating a
    bunch of users, backends, workspaces, locations, publications, and
    slaves.

    EXAMPLES::

        >>> import random; random.seed(0)
        >>> s = testconf_1(num_users=10, num_backends=7, num_workspaces=50, num_locations=100, num_publications=20, num_slaves=5, verbose=False)
        >>> s.query(User).count()
        10
        >>> s.query(Backend).count()
        7
        >>> s.query(Workspace).count()
        50
        >>> s.query(WorkspaceLocation).count()
        87
        >>> s.query(Publication).count()
        20
        >>> s.query(Slave).count()
        5
    """
    from random import randint
    
    drop_all()
    create()
    s = session()

    if verbose: print "Create users"
    for n in range(num_users):
        user = User()
        s.add(user)

        # create an account for that user
        account = Account('dropbox', '494436e8db0ae12b7652caafb2f07c3e49f5ffb1')
        user.accounts.append(account)

        # create another (1-to-n relationship)
        account = Account('google', 'bef1ab73d7465b9e20df00741a3f3e7659ebba87')
        user.accounts.append(account)

        # preferences for the user
        uprefs = UserPreferences()
        uprefs.username = "sage user %s"%(n+1)
        uprefs.email_address = "sageuser%s@example.com"%(n+1)
        uprefs.theme = "blue"
        uprefs.keyboard_shortcuts = "{'control-enter':'evaluate'}"
        user.user_preferences = uprefs

        # some user tracking
        user.tracking.append(UserTracking('login'))
        # track user doing something
        user.tracking.append(UserTracking('backend-cpu', 7, 394))
        # track something else
        user.tracking.append(UserTracking('backend-ram', 7, 2000))
        # viewing of a published workspace with published id 394
        user.tracking.append(UserTracking('pub', 394))
        
    s.commit()

    if verbose: print "Create backends"
    for n in range(num_backends):
        backend = Backend()
        backend.uri = 'http://backend%s.sagews.com'%(n+1)
        backend.unix_user = 'sagews@backend%s.sagews.com'%(n+1)
        backend.is_running = True
        backend.load_number = 0.2
        backend.number_of_connected_users = 1
        backend.number_of_stored_workspaces = 1
        backend.disk_usage = 20
        backend.disk_available = 1000
        s.add(backend)
    s.commit()

    if verbose: print "Create some workspaces"
    for n in range(num_workspaces):
        ws = Workspace('Test Workspace %s'%(n+1))
        ws.active_backend_id = 1
        s.add(ws)
    s.commit()

    if verbose: print "Locate some workspaces"
    for i in range(num_locations):
        w = s.query(Workspace).filter('id=%s'%randint(1,num_workspaces)).one()
        loc = WorkspaceLocation(w, s.query(Backend).filter('id=%s'%randint(1,num_backends)).one())
        try:
            w.locations.append(loc)
            s.commit()
        except:
            s.rollback()

    if verbose: print "Create some permissions"
    for w in s.query(Workspace):
        Permission(workspace=w, user=s.query(User).filter('id=%s'%randint(1,num_users)).one(), type='owner')

    for w in s.query(Workspace):
        try:
            Permission(workspace=w, user=s.query(User).filter('id=%s'%randint(1,num_users)).one(), type='readonly')
            s.commit()
        except:
            # can't be both owner and readonly at same time
            s.rollback()

    if verbose: print "Publish some workspaces"
    for n in range(num_publications):
        ws = s.query(Workspace).filter('id=%s'%randint(1,num_workspaces)).one()
        p = Publication(commit_id = 'bef1ab73d7465b9e20df00741a3f3e7659ebba87',
                        main_filename = "foo_bar.sagews.sws",
                        published_timestamp = now())
        ws.publications.append(p)

    s.commit()

    if verbose: print "Create three account types"
    a = AccountType()
    a.name = "Free"
    a.description = "A completely free account"
    a.workspace_cpu_timeout = 120 # cputime
    a.workspace_wall_timeout = 3600 # cputime
    a.max_processes = 10
    a.max_MB_memory = 1000
    a.max_MB_disk_space = 50
    a.allow_private_publications = False
    a.max_users_per_workspace = 50
    s.add(a)

    a = AccountType()
    a.name = "Pro"
    a.description = "A premium pro subscription"
    a.workspace_cpu_timeout = -1   # cputime -- no timeout
    a.workspace_wall_timeout = -1 # cputime -- no timeout
    a.max_processes = 1000 # avoid forkbombs
    a.max_MB_memory = 10000
    a.max_MB_disk_space = 1000
    a.allow_private_publications = True
    a.max_users_per_workspace = -1  # no limit
    s.add(a)

    a = AccountType()
    a.name = "Free Pub Browser"
    a.description = "Completely free account used for non-authenticated users browsing published resources"
    a.workspace_cpu_timeout = 20 # cputime
    a.workspace_wall_timeout = 600 # cputime
    a.max_processes = 2
    a.max_MB_memory = 1000
    a.max_MB_disk_space = 10
    a.allow_private_publications = False
    a.max_users_per_workspace = 1
    s.add(a)
    s.commit()

    if verbose: print "Create some slaves"
    for n in range(num_slaves):
        sl = Slave('http://slave%s.sagews.com'%(n+1))
        sl.last_update_timestamp = now()
        s.add(sl)
        
    s.commit()
    return s
    
    
