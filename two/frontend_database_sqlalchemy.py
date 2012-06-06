"""
Frontend database implemented using SQLAlchemy

"""

####################################################
# SQLalchemy + SQLite local file
# This is only for the first small testing version.
# Later we'll support a more scalable database.
####################################################

from sqlalchemy import create_engine
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

        >>> now()
        ?
        >>> time.localtime(now())
        ?
        >>> time.asctime(time.localtime(now()))
        ?
    """
    return time.time()

class User(Base):
    """
    EXAMPLES::

        >>> drop_all(); create(); s = session()
        >>> u = User(); u
        <User None>
        >>> s.add(u); s.commit(); u
        <User 1>
        >>> u.timestamp
        ?
        >>> u = User(); s.add(u); s.commit()
        >>> v = s.query(User).all()[1]; v
        <User 2>
        >>> v.timestamp
        ?
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

class UserPreferences(Base):
    __tablename__ = "user_preferences"
    timestamp = Column(Float)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    username = Column(String)
    email_address = Column(String)
    theme = Column(String)
    keyboard_shortcuts = Column(String)

    # TODO: how do we do a 1<--> 1 relationship correctly??
    user = relationship("User", backref=backref('user_preferences'))

    
    def __init__(self):
        self.timestamp = now()

class UserTracking(Base):
    __tablename__ = "user_tracking"
    timestamp = Column(Float)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    resource = Column(String)
    data1 = Column(String)
    data2 = Column(String)
    
    user = relationship("User", backref=backref('user_tracking', order_by=resource))
    
    def __init__(self):
        self.timestamp = now()

class Backend(Base):
    __tablename__ = "backends"
    id = Column(Integer, primary_key=True)
    timestamp = Column(Float)
    def __init__(self):
        self.timestamp = now()

class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True)
    timestamp = Column(Float)
    def __init__(self):
        self.timestamp = now()
    
class WorkspaceLocation(Base):
    __tablename__ = "workspace_locations"
    timestamp = Column(Float)
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'))
    backend_id = Column(Integer, ForeignKey('backends.id'))
    def __init__(self):
        self.timestamp = now()

class Permissions(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True)
    timestamp = Column(Float)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'))
    user_id = Column(Integer, ForeignKey('users.id'))
    type = Column(String) # 'owner', 'collab', 'readonly', 'quiz', etc.
    def __init__(self):
        self.timestamp = now()

class PublishedWorkspace(Base):
    __tablename__ = "published_workspaces"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'))
    timestamp = Column(Float)
    date_published = Column(Float)
    commit_id = Column(String)
    main_filename = Column(String)
    def __init__(self):
        self.timestamp = now()

class AccountType(Base):
    __tablename__ = "account_types"
    timestamp = Column(Float)
    id = Column(Integer, primary_key=True)
    name = Column(String, primary_key=True)
    description = Column(String)

    # parameters
    workspace_timeout = Column(Float)
    max_processes = Column(Integer)
    max_MB_memory = Column(Integer)
    max_MB_disk_space = Column(Integer)
    allow_private_publication = Column(Boolean)
    max_users_per_workspace = Column(Integer)
    
    def __init__(self):
        self.timestamp = now()

class Slave(Base):
    __tablename__ = "slaves"
    timestamp = Column(Float)

    id = Column(Integer, primary_key=True)
    URI = Column(String)
    last_update_timestamp = Column(Float)
    
    def __init__(self):
        self.timestamp = now()
    

    


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
        >>> S.add(User('wstein'))
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

def testconf_1():
    drop_all()
    create()
    s = session()

    # create a user
    user = User()
    s.add(user)
    s.commit()
    
    # create an account for that user
    account = Account('dropbox', '243aslnfdkasdfvoi243nr23rnf')
    user.accounts.append(account)
    s.commit()

    return s

def testconf_many_users(n):
    pass
    
    
