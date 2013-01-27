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

def input_box(variable, label='', namespace=None, from_str=None, default=None, container_id=None):
    if container_id is None:
        container_id = uuid()
        salvus.html("<span id='%s'></span>"%container_id)

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
        namespace.set(variable, do_from_str(val), do_not_trigger=[variable_changed_in_python])
    cb_uuid = register_callback(variable_changed_in_browser)

    def variable_changed_in_python(val):
        salvus.execute_coffeescript("$('#%s').find('input').val('%s')"%(cb_uuid,val))
    namespace.on('change', variable, variable_changed_in_python)

    def variable_deleted_in_python():
        variable_changed_in_python('')

    namespace.on('del', variable, variable_deleted_in_python)

    if variable not in namespace:
        namespace[variable] = default
    else:
        variable_changed_in_browser(namespace[variable])

    # create the input box
    salvus.execute_coffeescript("$('#%s').append(interact.input_box(data))"%container_id,
              data = {'cb_uuid':cb_uuid, 'value':namespace[variable], 'label':label})

    return container_id


def checkbox(variable, label='', namespace=None, default=False, container_id=None):
    if container_id is None:
        container_id = uuid()
        salvus.html("<span id='%s'></span>"%container_id)

    default = bool(default)

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

    def variable_changed_in_browser(val):
        namespace.set(variable, bool(val), do_not_trigger=[variable_changed_in_python])
    cb_uuid = register_callback(variable_changed_in_browser)

    def variable_changed_in_python(val):
        salvus.execute_coffeescript("$('#%s').find('input').attr('checked', data)"%cb_uuid, data=bool(val))
    namespace.on('change', variable, variable_changed_in_python)

    def variable_deleted_in_python():
        variable_changed_in_python(False)

    namespace.on('del', variable, variable_deleted_in_python)

    if variable not in namespace:
        namespace[variable] = default
    else:
        variable_changed_in_browser(namespace[variable])

    # create the checkbox.
    salvus.execute_coffeescript("$('#%s').append(interact.checkbox(data))"%container_id,
              data = {'cb_uuid':cb_uuid, 'value':namespace[variable], 'label':label})

    return container_id


##########################################################################
# New function interact implementation -- doesn't use code from above!
##########################################################################
import inspect

interacts = {}

def jsonable(x):
    """
    Given any object x, make a JSON-able version of x, doing as best we can.
    For some objects, sage as Sage integers, this works well.  For other
    objects which make no sense in Javascript, we get a string.
    """
    try:
        json.dumps(x)
        return x
    except:
        return repr(x)


class Control(object):
    def __init__(self, label, default, control_type):
        self._label = label
        self._default = jsonable(default)
        self._type  = type(default)
        self._control_type = control_type

    def jsonable(self):
        return {'control_type':self._control_type, 'label':self._label, 'default':self._default}

class TextInput(Control):
    def __init__(self, arg, value):
        Control.__init__(self, label=arg, default=value, control_type='text-input')

class Interact(object):
    def __init__(self, f, layout=None, width=None):
        """
        Given a function f, create an object that describes an interact
        for working with f interactively.
        """
        self._uuid = uuid()
        # Prevent garbage collection until client specifically requests it,
        # since we want to be able to store state.
        interacts[self._uuid] = self

        self._f = f
        self._layout = layout
        self._width = width if width is None else str(width)

        (args, varargs, varkw, defaults) = inspect.getargspec(f)
        if defaults is None:
            defaults = []

        n = len(args) - len(defaults)
        self._controls  = [interact_control(arg, defaults[i-n] if i >= n else None)
                           for i, arg in enumerate(args)]

        self._last_vals = {}
        for i, arg in enumerate(args):
            self._last_vals[arg] = self._controls[i].default()

    def jsonable(self):
        """
        Return a JSON-able description of this interact, which the client
        can use for laying out controls.
        """
        X = {'controls':[c.jsonable() for c in self._controls], 'id':self._uuid}
        if self._width is not None:
            X['width'] = self._width
        if self._layout is not None:
            X['layout'] = self._layout
        return X

    def __call__(self, vals):
        """
        Call self._f with inputs specified by vals.  Any input variables not
        specified in vals will have the value they had last time.
        """
        for k, v in vals.iteritems():
            if k not in self._last_vals:
                raise RuntimeError("interact -- trying to set unknown input variable '%s' to '%s'"%(k,v))
            self._last_vals[k] = v
        self._f(**self._last_vals)

class _interact_layout:
    def __init__(self, layout, width):
        self._layout = layout
        self._width = width
    def __call__(self, f):
        return interact(f, self._layout, self._width)

def interact(f=None, layout=None, width=None):
    """
    Use interact to very easily create interactive worksheet
    cells with sliders, text boxes, radio buttons, check boxes, and
    color selectors.

    Put ``@interact`` on the line before a function definition in a
    cell by itself, and choose appropriate defaults for the variable
    names to determine the types of controls (see tables below).  You
    may also put ``@interact(layout=...)`` to control the layout of
    controls.  In addition, you can type interact(f), if f is a
    function.

    INPUT:

    - `f` -- function
    - `layout` -- TODO
    - `width` -- number, or string such as '80%', '300px', '20em'.

    OUTPUT:

        - creates an interactive control.
    """
    if f is None:
        return _interact_layout(layout, width)
    else:
        salvus.interact(f, layout=layout, width=width)

class control:
    def __init__(self, control_type, opts, repr):
        self._control_type = control_type
        self._opts = dict(opts)
        self._repr = repr

    def __repr__(self):
        return self._repr

    def label(self):
        """Return the label of this control."""
        return self._opts['label']

    def default(self):
        """Return default value of this control."""
        return self._opts['default']

    def type(self):
        """Return type that values of this control are coerced to."""
        return self._opts['type']

    def jsonable(self):
        """Return JSON-able object the client browser uses to render the control."""
        X = {'control_type':self._control_type}
        for k, v in self._opts.iteritems():
            X[k] = jsonable(v)
        return X

def interact_control(arg, value):
    if isinstance(value, control):
        if value._opts['label'] is None:
            value._opts['label'] = arg
        c = value
    else:
        c = input_box(label=arg, default=value)
    c._opts['var'] = arg
    return c

def input_box(default=None, label=None, type=None, width=80, height=1):
    """
    An input box interactive control.  Use this in conjunction
    with the :func:`interact` command.
    """
    return control(
            control_type = 'input-box',
            opts         = locals(),
            repr         = "Interact input box labeled %r with default value %r"%(label, default)
        )

interact_functions = {'interact':interact, 'input_box':input_box}


