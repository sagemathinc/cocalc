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
from sqlalchemy.orm import relation, backref

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)    
    name = Column(String)
    
    def __init__(self, name):
        self.name = str(name)




####################################################
# Helper functions for working with the database
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

