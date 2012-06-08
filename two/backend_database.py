"""
Backend database implemented using SQLAlchemy + SQLite
"""

import os

if not os.path.exists('data'):
    os.makedirs('data')
from sqlalchemy import create_engine
db_file = 'data/backend.sqlite'
engine = create_engine('sqlite:///%s'%db_file)


####################################################
# Declare the Schema
####################################################
import time
def now():
    return time.time()

from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()

from sqlalchemy import (Boolean, Column, DateTime, Float, Integer, String, ForeignKey)
from sqlalchemy.orm import relationship, backref

class Workspace(Base):
    """
    Table of workspaces that are stored on this backend, along with
    the last time when a snapshot (git commit) was done.

    EXAMPLES::

        >>> drop_all(); create(); s = session()
        >>> s.add(Workspace(394))
        >>> s.commit()
        >>> w = s.query(Workspace).all()[0]; w
        <Workspace 394>
        >>> w.last_commit_timestamp = now()
        >>> w.locations
        []        
    """
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True)  # same as in frontend database
    last_commit_timestamp = Column(Float)
    
    def __init__(self, id):
        self.id = id

    def __repr__(self):
        return "<Workspace %s>"%self.id


class Backend(Base):
    """
    Records the uri's of any other backends to which we will be
    replicating workspaces.
    """
    __tablename__ = "backends"
    id = Column(Integer, primary_key=True)  # same as in frontend database
    uri = Column(String)
    
    def __init__(self, id, uri):
        self.id = id
        self.uri = uri

    def __repr__(self):
        return '<Backend %s at "%s">'%(self.id, self.uri)

class Location(Base):
    """
    Table giving the backends to which a given workspace is
    replicated.  When a workspace is running on this backend and
    changes, we push the changes to these other backends.  We keep
    track of whether or not a push is needed via the
    last_udpate_timestamp.

    EXAMPLES::

        >>> drop_all(); create(); s = session()
        >>> ws = Workspace(394); be = Backend(1, 'http://b1.sagews.com');
        >>> s.add(ws); s.add(be); s.commit()
        >>> ws.locations.append(Location(be))
        >>> s.commit() 
    """
    __tablename__ = "locations"
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), primary_key=True)
    backend_id = Column(Integer, ForeignKey('backends.id'), primary_key=True)
    last_update_timestamp = Column(Float)

    workspace = relationship("Workspace", backref=backref('locations', order_by=backend_id))
    backend = relationship("Backend", backref=backref('workspaces', order_by=workspace_id))

    def __init__(self, backend):
        self.backend = backend

    def __repr__(self, backend_id):
        return '<Location: Workspace %s replicated to Backend %s>'%(
            self.workspace_id, self.backend_id)
    
####################################################
# Working with the database
####################################################
def create():
    Base.metadata.create_all(engine)

def session():
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    return Session()

def drop_all():
    Base.metadata.drop_all(engine)



####################################################
# Testing Configurations
# Insert data in database to make it configured
# in various ways that are useful for testing.
####################################################

def testconf_1(num_workspaces=1, num_backends=1, num_locations_per_workspace=1, verbose=True):
    """
    EXAMPLES::

        >>> s = testconf_1(50, 5, 2)
        Adding 50 workspaces...
        Adding 5 backends...
        Adding 2 locations for each workspace...
        >>> s.query(Workspace).count()
        50
        >>> s.query(Backend).count()
        5
        >>> s.query(Location).count()
        100
    """
    from misc import randint_set
    
    drop_all()
    create()
    s = session()

    if verbose: print "Adding %s workspaces..."%num_workspaces
    for i in range(num_workspaces):
        s.add(Workspace(i+1))
    s.commit()

    if verbose: print "Adding %s backends..."%num_backends
    for i in range(num_backends):
        s.add(Backend(i+1, 'http://backend%s.sagews.com'%(i+1)))
    s.commit()

    if verbose: print "Adding %s locations for each workspace..."%num_locations_per_workspace
    backends = s.query(Backend).all()
    for w in s.query(Workspace).all():
        # choose three distinct backends
        for i in randint_set(0, len(backends)-1, num_locations_per_workspace):
            w.locations.append(Location(backends[i]))
    s.commit()
    
    return s
    

