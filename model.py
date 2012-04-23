"""
Workspace Server Database Model
"""

db_file = 'model.sqlite3'

import datetime, os

from sqlalchemy import create_engine
engine = create_engine('sqlite:///%s'%db_file)

from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()

from sqlalchemy import (Boolean, Column, DateTime, Integer, String, ForeignKey)
from sqlalchemy.orm import relation, backref

class Session(Base):
    __tablename__ = 'sessions'
    id = Column(Integer, primary_key=True)
    pid = Column(Integer)
    path = Column(String)
    url = Column(String)
    status = Column(String)
    next_exec_id = Column(Integer)
    last_active_exec_id = Column(Integer)
    start_time = Column(DateTime)
    cells = relation("Cell", order_by="Cell.exec_id",
                     backref='session', cascade='all, delete, delete-orphan')
    
    def __init__(self, id, pid, path, url, status='ready', next_exec_id=0, last_active_exec_id=-1):
        self.id = int(id)
        self.pid = int(pid)
        self.path = str(path)
        self.url = str(url)
        self.status = str(status)
        self.next_exec_id = int(next_exec_id)  # 
        self.last_active_exec_id = int(last_active_exec_id)  #
        self.start_time = datetime.datetime.now()

    def to_json(self):
        return {'id':self.id, 'pid':self.pid, 'path':self.path,
                'url':self.url, 'status':self.status,
                'next_exec_id':self.next_exec_id,
                'last_active_exec_id':self.last_active_exec_id,
                'start_time':str(self.start_time)}

    def __repr__(self):
        return "Session(%s, pid=%s, path='%s', url='%s', status='%s', next_exec_id=%s, last_active_exec_id=%s, start_time=%s)"%(
            self.id, self.pid, self.path, self.url, self.status,
            self.next_exec_id, self.last_active_exec_id, self.start_time)

class Cell(Base):
    __tablename__ = 'cells'
    exec_id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey('sessions.id'), primary_key=True)
    code = Column(String)
    output = relation("OutputMsg", order_by="OutputMsg.number",
                      backref='cell', cascade='all, delete, delete-orphan',
                      primaryjoin='and_(Cell.session_id==OutputMsg.session_id, Cell.exec_id==OutputMsg.exec_id)')

    def __init__(self, exec_id, session_id, code):
        self.exec_id = int(exec_id)
        self.session_id = int(session_id)
        self.code = str(code)

    def to_json(self):
        return {'exec_id':self.exec_id, 'code':self.code}

    def __repr__(self):
        return "Cell(%s, session_id=%s, code='%s', output=%s)"%(
            self.exec_id, self.session_id, self.code, self.output)

class OutputMsg(Base):
    __tablename__ = 'output_msg'
    number = Column(Integer, primary_key=True)
    exec_id = Column(Integer, ForeignKey('cells.exec_id'), primary_key=True)
    session_id = Column(Integer, ForeignKey('cells.session_id'), primary_key=True)
    done = Column(Boolean)
    output = Column(String)
    modified_files = Column(String)

    def __init__(self, number, exec_id, session_id):
        """
        Create an OutputMsg object.

        INPUT::

        - ``number`` -- (nonnegative integer) message number
        - ``exec_id`` -- (nonnegative integer) id of block of code
          that is being evaluated
        - ``session_id`` -- (nonnegative integer) id of session in
          which code is being evaluated

        EXAMPLES::

            >>> drop_all(); create()
            
        
        
        """
        self.number = int(number)
        self.exec_id = int(exec_id)
        self.session_id = int(session_id)

    def __repr__(self):
        return "OutputMsg(%s, exec_id=%s, session_id=%s, done=%s, output='%s', modified_files='%s')"%(
            self.number, self.exec_id, self.session_id, self.done,
            self.output, self.modified_files)

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
        >>> S.add(Session(0, 12345, '/tmp/', 'http://localhost:5000'))
        >>> S.commit()
        >>> S.query(Session).count()
        1
        >>> drop_all()
        >>> S = session()

    This query fails because we deleted all the tables::
    
        >>> S.query(Session).count()
        Traceback (most recent call last):
        ...
        OperationalError: (OperationalError) no such table: sessions u'SELECT count(1) AS count_1 \nFROM sessions' []
    """
    Base.metadata.drop_all(engine)

def session():
    """
    Return a database session.
    
    EXAMPLES::

        >>> session()
        <sqlalchemy.orm.session.Session object at 0x...>
    """
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    return Session()

def create():
    r"""
    Create the database.

    EXAMPLES::

    We first do a query before the database is created and get an
    error::

        >>> drop_all()
        >>> S = session()
        >>> S.query(Session).count()
        Traceback (most recent call last):
        ...
        OperationalError: (OperationalError) no such table: sessions u'SELECT count(1) AS count_1 \nFROM sessions' []

    After creating the DB, it works, and we get no records::

        >>> create()
        >>> S.query(Session).count()
        0
    """
    Base.metadata.create_all(engine)



