##################################################################################
#                                                                                #
# Extra code that the Salvus server makes available in the running Sage session. #
#                                                                                #
##################################################################################

import sys

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
    import sage.all
    try:
        json.dumps(x)
        return x
    except:
        if isinstance(x, (sage.all.Integer)):
            return int(x)
        else:
            return str(x)

class InteractCell(object):
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
        self._controls  = dict([(arg, interact_control(arg, defaults[i-n] if i >= n else None))
                           for i, arg in enumerate(args)])

        self._last_vals = {}
        for arg in args:
            self._last_vals[arg] = self._controls[arg].default()

        self._ordered_args = args
        self._args = set(args)

    def jsonable(self):
        """
        Return a JSON-able description of this interact, which the client
        can use for laying out controls.
        """
        X = {'controls':[self._controls[arg].jsonable() for arg in self._ordered_args], 'id':self._uuid}
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
            x = self._controls[k](v)
            self._last_vals[k] =  x
        _control_values.append(self._last_vals)
        _controls.append(self._controls)
        try:
            self._f(**dict([(k,self._last_vals[k]) for k in self._args]))
        finally:
            _control_values.pop()
            _controls.pop()

class _interact_layout:
    def __init__(self, layout, width):
        self._layout = layout
        self._width = width
    def __call__(self, f):
        return interact(f, self._layout, self._width)

class Interact(object):
    """
    Use interact to create interactive worksheet cells with sliders,
    text boxes, radio buttons, check boxes, and color selectors.

    Put ``@interact`` on the line before a function definition in a
    cell by itself, and choose appropriate defaults for the variable
    names to determine the types of controls (see tables below).  You
    may also put ``@interact(layout=...)`` to control the layout of
    controls.    Within the function, you may explicitly set the value
    of the control corresponding to a variable foo to bar by typing
    interact.foo = bar.

    INPUT:

    - `f` -- function
    - `layout` -- TODO
    - `width` -- number, or string such as '80%', '300px', '20em'.

    OUTPUT:

    - creates an interactive control.


    AUTOMATIC CONTROL RULES
    -----------------------

    There are also some defaults that allow you to make controls
    automatically without having to explicitly specify them.  E.g.,
    you can make ``x`` a continuous slider of values between ``u`` and
    ``v`` by just writing ``x=(u,v)`` in the argument list.

    - ``u`` - blank input_box
    - ``u=elt`` - input_box with ``default=element``, unless other rule below
    - ``u=(umin,umax)`` - continuous slider (really `100` steps)
    - ``u=(umin,umax,du)`` - slider with step size ``du``
    - ``u=list`` - buttons if ``len(list)`` at most `5`; otherwise, drop down
    - ``u=generator`` - a slider (up to `10000` steps)
    - ``u=bool`` - a checkbox
    - ``u=Color('blue')`` - a color selector; returns ``Color`` object
    - ``u=matrix`` - an ``input_grid`` with ``to_value`` set to
      ``matrix.parent()`` and default values given by the matrix
    - ``u=(default, v)`` - ``v`` anything as above, with given ``default`` value
    - ``u=(label, v)`` - ``v`` anything as above, with given ``label`` (a string)

    EXAMPLES:


    We illustrate features that are only in Salvus, not in the Sage
    cell server or Sage notebook.

    You can set the value of a control called foo to 100 using
    interact.foo=100. For example::

        @interact
        def f(n=20, twice=None):
            interact.twice = int(n)*2


    In this example, we create and delete multiple controls depending
    on properties of the input::

        @interact
        def f(n=20, **kwds):
            print kwds
            n = Integer(n)
            if n % 2 == 1:
                del interact.half
            else:
                interact.half = input_box(n/2, readonly=True)
            if n.is_prime():
                interact.is_prime = input_box('True', readonly=True)
            else:
                del interact.is_prime

    You can access the value of a control associated to a variable foo
    that you create using interact.foo, and check whether there is a
    control associated to a given variable name using hasattr::

        @interact
        def f():
            if not hasattr(interact, 'foo'):
                interact.foo = 'hello'
            else:
                print interact.foo

    An indecisive interact::

        @interact
        def f(n=selector(['yes', 'no'])):
            for i in range(5):
                interact.n = i%2
                sleep(.2)
    """
    def __call__(self, f=None, layout=None, width=None):
        if f is None:
            return _interact_layout(layout, width)
        else:
            salvus.interact(f, layout=layout, width=width)

    def __setattr__(self, arg, value):
        if arg in _controls[-1]:
            # setting value of existing control
            desc = {'var':arg, 'default':_controls[-1][arg].convert_to_client(value)}
        else:
            # create a new control
            desc = interact_control(arg, value).jsonable()
        salvus.javascript("cell._set_interact_var(obj)", obj=desc)

    def __delattr__(self, arg):
        salvus.javascript("cell._del_interact_var(obj)", obj=jsonable(arg))

    def __getattr__(self, arg):
        try:
            return _control_values[-1][arg]
        except:
            raise AttributeError("no interact control corresponding to input variable '%s'"%arg)

interact = Interact()
_control_values = []
_controls = []

class control:
    def __init__(self, control_type, opts, repr, convert_from_client=None, convert_to_client=jsonable):
        # The type of the control -- a string, used for CSS selectors, switches, etc.
        self._control_type = control_type
        # The options that define the control -- passed to client
        self._opts = dict(opts)
        # Used to print the control to a string.
        self._repr = repr
        # Callable that the control may use in converting from JSON
        self._convert_from_client = convert_from_client
        self._convert_to_client = convert_to_client
        self._last_value = self._opts['default']

    def convert_to_client(self, value):
        return self._convert_to_client(value)

    def __call__(self, obj):
        """
        Convert JSON-able object returned from client to describe
        value of this control.
        """
        if self._convert_from_client is not None:
            try:
                x = self._convert_from_client(obj)
            except Exception, err:
                sys.stderr.write("%s -- %s\n"%(err, self))
                sys.stderr.flush()
                x = self._last_value
        else:
            x = obj
        self._last_value = x
        return x

    def __repr__(self):
        return self._repr

    def label(self):
        """Return the label of this control."""
        return self._opts['label']

    def default(self):
        """Return default value of this control."""
        return self(self._opts['default'])

    def type(self):
        """Return type that values of this control are coerced to."""
        return self._opts['type']

    def jsonable(self):
        """Return JSON-able object the client browser uses to render the control."""
        X = {'control_type':self._control_type}
        for k, v in self._opts.iteritems():
            X[k] = jsonable(v)
        return X

import types

def automatic_control(default):
    from sage.matrix.all import is_Matrix
    from sage.all import Color
    label = None
    default_value = None

    for _ in range(2):
        if isinstance(default, tuple) and len(default) == 2 and isinstance(default[0], str):
            label, default = default
        if isinstance(default, tuple) and len(default) == 2 and isinstance(default[1], (tuple, list, types.GeneratorType)):
            default_value, default = default

    if isinstance(default, control):
        if label:
            default._opts['label'] = label
        return default
    elif isinstance(default, str):
        return input_box(default, label=label, type=str)
    elif isinstance(default, bool):
        return checkbox(default, label=label)
    elif isinstance(default, list):
        return selector(default, default=default_value, label=label, buttons=len(default) <= 5)
    elif isinstance(default, types.GeneratorType):
        return slider(list_of_first_n(default, 10000), default=default_value, label=label)
    elif isinstance(default, Color):
        return input_box(default, label=label, type=Color)
    elif isinstance(default, tuple):
        if len(default) == 2:
            return slider(default[0], default[1], default=default_value, label=label)
        elif len(default) == 3:
            return slider(default[0], default[1], default[2], default=default_value, label=label)
        else:
            return slider(list(default), default=default_value, label=label)
    elif is_Matrix(default):
        return input_grid(default.nrows(), default.ncols(), default=default.list(), to_value=default.parent())
    else:
        return input_box(default, label=label)

def interact_control(arg, value):
    if isinstance(value, control):
        if value._opts['label'] is None:
            value._opts['label'] = arg
        c = value
    else:
        c = automatic_control(value)
        if c._opts['label'] is None:
            c._opts['label'] = arg
    c._opts['var'] = arg
    return c

class ParseValue:
    def __init__(self, type):
        self._type = type
    def _eval(self, value):
        value = str(value)
        if value.isspace():
            return None
        if len(value.strip()) == 0:
            return None
        from sage.all import sage_eval
        return sage_eval(value, salvus.namespace)

    def __call__(self, value):
        from sage.all import Color
        if self._type is None:
            return self._eval(value)
        elif self._type is str:
            return str(value)
        elif self._type is Color:
            try:
                return Color(value)
            except ValueError:
                try:
                    return Color("#"+value)
                except ValueError:
                    raise TypeError("invalid color '%s'"%value)
        else:
            return self._type(self._eval(value))

def input_box(default=None, label=None, type=None, width=80, height=1, readonly=False):
    """
    An input box interactive control for use with the :func:`interact` command.
    """
    return control(
            control_type = 'input-box',
            opts         = locals(),
            repr         = "Input box labeled %r with default value %r"%(label, default),
            convert_from_client = ParseValue(type)
        )

def checkbox(default=True, label=None, readonly=False):
    """
    A checkbox interactive control for use with the :func:`interact` command.
    """
    return control(
            control_type = 'checkbox',
            opts         = locals(),
            repr         = "Checkbox labeled %r with default value %r"%(label, default)
        )

def selector(values, label=None, default=None,
             nrows=None, ncols=None, width=None, buttons=False):
    """
        A drop down menu or a button bar for use in conjunction with
        the :func:`interact` command.  We use the same command to
        create either a drop down menu or selector bar of buttons,
        since conceptually the two controls do exactly the same thing
        - they only look different.  If either ``nrows`` or ``ncols``
        is given, then you get a buttons instead of a drop down menu.

        INPUT:

        - ``values`` - either (1) a list [val0, val1, val2, ...] or (2)
          a list of pairs [(val0, lbl0), (val1,lbl1), ...] in which case
          all labels must be given or must all equal None.
        - ``label`` - a string (default: None); if given, this label
          is placed to the left of the entire button group
        - ``default`` - an object (default: first); default value in values list
        - ``nrows`` - an integer (default: None); if given determines
          the number of rows of buttons; if given, buttons=True
        - ``ncols`` - an integer (default: None); if given determines
          the number of columns of buttons; if given, buttons=True
        - ``width`` - an integer or string (default: None); if given,
          all buttons are this width (in HTML ex units).
        - ``buttons`` - a bool (default: False, except as noted
          above); if True, use buttons
    """
    if (len(values) > 0 and isinstance(values[0], tuple) and len(values[0]) == 2):
        vals = [z[0] for z in values]
        lbls = [str(z[1]) if z[1] is not None else None for z in values]
    else:
        vals = values
        lbls = [None] * len(vals)

    for i in range(len(vals)):
        if lbls[i] is None:
            v = vals[i]
            lbls[i] = v if isinstance(v, str) else str(v)

    if default is None:
        default = 0
    else:
        try:
            default = vals.index(default)
        except IndexError:
            default = 0

    opts = dict(locals())
    for k in ['vals', 'values', 'i', 'v', 'z']:
        if k in opts:
            del opts[k]  # these could have a big jsonable repr

    opts['lbls'] = lbls
    return control(
            control_type        = 'selector',
            opts                = opts,
            repr                = "Selector labeled %r with values %s"%(label, values),
            convert_from_client = lambda n : vals[int(n)],
            convert_to_client   = lambda x : vals.index(x)
        )

interact_functions = {}
for f in ['interact', 'input_box', 'checkbox', 'selector']:
    interact_functions[f] = globals()[f]


