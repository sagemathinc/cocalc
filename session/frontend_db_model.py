import os

from sqlalchemy import create_engine
engine = create_engine('sqlite:///frontend.sqlite3')

from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()

from sqlalchemy import (Column, Integer, String, ForeignKey)
from sqlalchemy.orm import relation, backref

class Session(Base):
    __tablename__ = 'sessions'
    id = Column(Integer, primary_key=True)
    pid = Column(Integer)
    path = Column(String)
    url = Column(String)
    status = Column(String)
    next_exec_id = Column(Integer)
    cells = relation("Cell", backref='session')#, cascade='all, delete, delete-orphan')
    
    def __init__(self, id, pid, path, url, status='ready', next_exec_id=0):
        self.id = int(id)
        self.pid = int(pid)
        self.path = str(path)
        self.url = str(url)
        self.status = str(status)
        self.next_exec_id = int(next_exec_id)

    def __repr__(self):
        return "Session(%s, pid=%s, path='%s', url='%s', status='%s', next_exec_id=%s)"%(
            self.id, self.pid, self.path, self.url, self.status, self.next_exec_id)

class Cell(Base):
    __tablename__ = 'cells'
    exec_id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey('sessions.id'))
    input = Column(String)
    output = Column(String)
    modified_files = Column(String)

    def __init__(self, exec_id, session_id, input, output=None, modified_files=None):
        self.exec_id = int(exec_id)
        self.session_id = int(session_id)
        self.input = str(input)
        if output is not None:
            self.output = output
        if modified_files is not None:
            self.modified_files = modified_files

    def __repr__(self):
        return "Cell(%s, session_id=%s, input='%s', output='%s', modified_files='%s')"%(
            self.exec_id, self.session_id, self.input, self.output, self.modified_files)

def drop_all():
    Base.metadata.drop_all(engine)

def session():
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    return Session()

def create():
    Base.metadata.create_all(engine)



