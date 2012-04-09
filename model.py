"""
Workspace Server Database Model
"""

db_file = 'model.sqlite3'

import os

from sqlalchemy import create_engine
engine = create_engine('sqlite:///%s'%db_file)

from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()

from sqlalchemy import (Boolean, Column, Integer, String, ForeignKey)
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
    cells = relation("Cell", order_by="Cell.exec_id", backref='session', cascade='all, delete, delete-orphan')
    
    def __init__(self, id, pid, path, url, status='ready', next_exec_id=0, last_active_exec_id=-1):
        self.id = int(id)
        self.pid = int(pid)
        self.path = str(path)
        self.url = str(url)
        self.status = str(status)
        self.next_exec_id = int(next_exec_id)  # 
        self.last_active_exec_id = int(last_active_exec_id)  # 

    def __repr__(self):
        return "Session(%s, pid=%s, path='%s', url='%s', status='%s', next_exec_id=%s, last_active_exec_id=%s)"%(
            self.id, self.pid, self.path, self.url, self.status,
            self.next_exec_id, self.last_active_exec_id)

class Cell(Base):
    __tablename__ = 'cells'
    exec_id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey('sessions.id'), primary_key=True)
    code = Column(String)
    output = relation("OutputMsg", order_by="OutputMsg.number",
                      backref='cell', cascade='all, delete, delete-orphan',
                      primaryjoin='Cell.exec_id==OutputMsg.exec_id and Cell.session_id==OutputMsg.session_id')

    def __init__(self, exec_id, session_id, code):
        self.exec_id = int(exec_id)
        self.session_id = int(session_id)
        self.code = str(code)

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
        self.number = int(number)
        self.exec_id = int(exec_id)
        self.session_id = int(session_id)

    def __repr__(self):
        return "OutputMsg(%s, exec_id=%s, session_id=%s, done=%s, output='%s', modified_files='%s')"%(
            self.number, self.exec_id, self.session_id, self.done,
            self.output, self.modified_files)

def drop_all():
    Base.metadata.drop_all(engine)

def session():
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    return Session()

def create():
    Base.metadata.create_all(engine)



