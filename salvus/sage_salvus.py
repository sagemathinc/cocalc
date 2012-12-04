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
    salvus.obj(callbacks[cb_uuid](value))

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

def input_box(variable, namespace=None, from_str=None, default=None):

    if namespace is None:
        namespace = salvus.namespace
    elif not isinstance(namespace, salvus.Namespace):
        raise TypeError, "namespace must be of type salvus.Namespace."

    if not isinstance(variable, str):
        i = id(variable)
        variable = None
        for x, y in namespace.iteritems():
            if id(y) == i:
                if variable is not None:
                    raise ValueError, "variable does not uniquely determine its name -- use a string instead"
                variable = x
        if variable is None:
            raise ValueError, "variable does not determine its name -- use a string instead"

    if from_str is not None:
        def do_from_str(x):
            try:
                return from_str(str(x))  # str is to convert it from unicode
            except Exception, mesg:
                return mesg
    else:
        def do_from_str(x): return str(x)

    def variable_changed_in_browser(val):
        namespace.set_without_trigger(variable, do_from_str(val))

    cb_uuid = register_callback(variable_changed_in_browser)

    def variable_changed_in_python(val):
        salvus.execute_coffeescript("$('#%s').val('%s')"%(cb_uuid,val))

    namespace.on('change', variable, variable_changed_in_python)

    def variable_deleted_in_python():
        variable_changed_in_python('')

    namespace.on('del', variable, variable_deleted_in_python)

    if variable not in namespace:
        namespace[variable] = default
    else:
        variable_changed_in_browser(namespace[variable])

    salvus.coffeescript("interact.input_box(cell:cell, cb_uuid:'%s', value:'%s')"%(cb_uuid, namespace[variable]))
