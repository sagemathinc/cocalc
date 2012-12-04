##################################################################################
#                                                                                #
# Extra code that the Salvus server makes available in the running Sage session. #
#                                                                                #
##################################################################################

salvus = None


import json
from uuid import uuid4
def uuid():
    return str(uuid4())

callbacks = {}

def register_callback(f):
    cb_uuid = uuid()
    callbacks[cb_uuid] = f   # todo -- should be a weak ref?
    return cb_uuid

def call(cb_uuid, value):
    salvus.obj(callbacks[cb_uuid](json.loads(value)))

def input_box0(cb):
    cb_uuid = register_callback(cb)
    salvus.coffeescript("interact.input_box(cell:cell, cb_uuid:'%s')"%cb_uuid)


########################

variables = {}

def register_variable(name, namespace, var_uuid=None):
    if var_uuid is None:
        var_uuid = uuid()
    variables[var_uuid] = (namespace, name)
    return var_uuid

def set_variable(var_uuid, value):
    namespace, name = variables[var_uuid]
    namespace[name] = value

def get_variable(var_uuid):
    namespace, name = variables[var_uuid]
    return namespace[name]

def input_box(variable, namespace=None):
    if namespace is None:
        namespace = salvus.namespace
    salvus.execute_coffeescript
