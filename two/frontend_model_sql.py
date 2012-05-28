"""
Frontend database model implemented using SQLAlchemy
"""

####################################################
# SQLalchemy + SQLite local file
# This is only for the first small testing version.
# Later we'll support a more scalable database.
####################################################
from sqlalchemy import create_engine
db_file = 'data/frontend.sql'
engine = create_engine('sqlite:///%s'%db_file)

####################################################
# Declare the Schema
####################################################
from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()

from sqlalchemy import (Boolean, Column, DateTime, Integer, String, ForeignKey)
from sqlalchemy.orm import relationship, backref

class User(Base):
    """
    EXAMPLES::

        >>> from frontend_model_sql import *
        >>> drop_all(); create(); s = session()
        >>> u = User('wstein')
        >>> s.add(u); s.commit()
        >>> u = User('wstein2', 'djfljsdf')
        >>> s.add(u); s.commit()
        >>> v = s.query(User).all()[1]; v
        <User 'wstein2'>        
        >>> v.passwd_hash
        'djfljsdf'
    """
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)    
    name = Column(String)
    
    def __init__(self, name, passwd_hash='x'):
        self.name = str(name)
        self.passwd_hash = str(passwd_hash)

    def __repr__(self):
        return "<User '%s'>"%(self.name,)

class UserSetting(Base):
    """
    EXAMPLES::

        >>> drop_all(); create(); s = session()
        >>> u = User('wstein')
        >>> s.add(u)
        >>> s.commit()
        >>> b = UserSetting('timeout', '7')
        >>> u.user_settings.append(b)
        >>> s.commit()
        >>> s.query(User)[0].user_settings
        [<UserSetting wstein.timeout='7'>]
        >>> u.user_settings.append(UserSetting('account', 'pro'))
        >>> s.query(User)[0].user_settings
        [<UserSetting wstein.timeout='7'>, <UserSetting wstein.account='pro'>]

    Check uniqueness constraint::
    
        >>> c = UserSetting('timeout', '20')
        >>> u.user_settings.append(c)
        >>> s.commit()
        Traceback (most recent call last):
        ...
        FlushError: New instance <UserSetting...> with identity key (<class 'frontend_model_sql.UserSetting'>, ('timeout',)) conflicts with persistent instance <UserSetting...>    
    """
    __tablename__ = "user_settings"
    user_id = Column(Integer, ForeignKey('users.id'))
    prop = Column(String, primary_key=True)
    value = Column(String)
    user = relationship("User", backref=backref('user_settings', order_by=prop))

    def __init__(self, prop, value):
        self.prop = prop
        self.value = value

    def __repr__(self):
        return "<UserSetting %s.%s='%s'>"%(self.user.name, self.prop, self.value)

        
class Workspace(Base):
    """
    EXAMPLES::
    
        >>> drop_all(); create(); s = session()
        >>> d = Workspace('Worksheet 1', 'worksheet', 'gae:794569'); d
        <Workspace 'Worksheet 1' of type worksheet at 'gae:794569'>
        >>> s.add(d); s.commit()
        >>> session().query(Workspace).all()
        [<Workspace 'Worksheet 1' of type worksheet at 'gae:794569'>]
        >>> d2 = Workspace('Worksheet 2', 'worksheet', content="2+2"); d2
        <Workspace 'Worksheet 2' of type worksheet>
        >>> d2.content
        '2+2'
        >>> s.add(d2); s.commit()
    """
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True)    
    name = Column(String)
    type = Column(String)
    location = Column(String)

    # Storing the content of an entire workspace in one single string
    # is just a very temporary thing.  Often it will be, e.g., a
    # project on github, a directory on google drive or something else
    # like that.
    content = Column(String)  

    def __init__(self, name, type, location=None, content=None):
        self.name = str(name)
        self.type = str(type)
        if location is not None:
            self.location = str(location)
        if content is not None:
            self.content = str(content)

    def __repr__(self):
        return "<Workspace '%s' of type %s%s>"%(self.name, self.type, " at '%s'"%self.location if self.location else '')
        

class WorkspaceUser(Base):
    """
    EXAMPLES::

        >>> drop_all(); create(); s = session()
        >>> d = Workspace('Worksheet 1', 'worksheet', 'gae:794569'); u = User('wstein'); u2 = User('xyz')
        >>> s.add(d); s.add(u); s.add(u2); s.commit()
        >>> d.users.append(WorkspaceUser(d.id, u.id, 'owner'))
        >>> d.users.append(WorkspaceUser(d.id, u2.id, 'collab'))
        >>> s.commit()
        >>> v = s.query(Workspace).one().users; v
        [<user_id=2, workspace_id=1, type=collab>, <user_id=1, workspace_id=1, type=owner>]
        >>> v[0].workspace
        <Workspace 'Worksheet 1' of type worksheet at 'gae:794569'>
        >>> v[0].user
        <User 'xyz'>
        >>> u.workspaces
        [<user_id=1, workspace_id=1, type=owner>]
    """
    __tablename__ = "workspace_users"
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    type = Column(String)
    
    workspace = relationship("Workspace", backref=backref('users', order_by=type))
    user = relationship("User", backref=backref('workspaces', order_by=type))    
    
    def __init__(self, workspace_id, user_id, type):
        self.user_id = user_id
        self.workspace_id = workspace_id
        self.type = type

    def __repr__(self):
        return "<user_id=%s, workspace_id=%s, type=%s>"%(self.user_id, self.workspace_id, self.type)


class Resource(Base):
    """
    EXAMPLES::
    
        >>> drop_all(); create(); s = session()
        >>> r = Resource('http://127.0.0.1:5010')
        >>> s.add(r); s.commit(); r
        <Resource 1 at http://127.0.0.1:5010>
        >>> s.query(Resource).one()
        <Resource 1 at http://127.0.0.1:5010>
        >>> r2 = Resource('http://127.0.0.1:5011'); r2
        <Resource None at http://127.0.0.1:5011>

    We commit so that the id gets set::
    
        >>> s.add(r2); s.commit(); r2
        <Resource 2 at http://127.0.0.1:5011>

    Look at some of the other properties (should all be empty)::

        >>> r.status_time is None
        True
        >>> r.alloc_time is None
        True
        >>> r.alloc_user_id is None
        True
        >>> r.alloc_workspace_id is None
        True
    """
    __tablename__ = "resources"
    id = Column(Integer, primary_key=True)
    url = Column(String)
    status = Column(String)
    status_time = Column(DateTime)
    alloc_time = Column(DateTime)
    alloc_user_id = Column(Integer, ForeignKey('users.id'))
    alloc_workspace_id = Column(Integer, ForeignKey('workspaces.id'))
    
    def __init__(self, url):
        self.url = str(url)

    def __repr__(self):
        return "<Resource %s at %s>"%(self.id, self.url)



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

