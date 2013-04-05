##################################################################################
#                                                                                #
# Extra code that the Salvus server makes available in the running Sage session. #
#                                                                                #
##################################################################################

#########################################################################################
#       Copyright (C) 2013 William Stein <wstein@gmail.com>                             #
#                                                                                       #
#  Distributed under the terms of the GNU General Public License (GPL), version 2+      #
#                                                                                       #
#                  http://www.gnu.org/licenses/                                         #
#########################################################################################


import copy, os, sys

salvus = None


import json
from uuid import uuid4
def uuid():
    return str(uuid4())


##########################################################################
# New function interact implementation
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
    def __init__(self, f, layout=None, width=None, style=None, update_args=None, auto_update=True, flicker=False, output=True):
        """
        Given a function f, create an object that describes an interact
        for working with f interactively.

        INPUT:

        - `f` -- Python function
        - ``width`` -- (default: None) overall width of the interact canvas
        - ``style`` -- (default: None) extra CSS style to apply to canvas
        - ``update_args`` -- (default: None) only call f if one of the args in
          this list of strings changes.
        - ``auto_update`` -- (default: True) call f every time an input changes
          (or one of the argus in update_args).
        - ``flicker`` -- (default: False) if False, the output part of the cell
          never shrinks; it can only grow, which aleviates flicker.
        - ``output`` -- (default: True) if False, do not automatically
          provide any area to display output.
        """
        self._flicker = flicker
        self._output = output
        self._uuid = uuid()
        # Prevent garbage collection until client specifically requests it,
        # since we want to be able to store state.
        interacts[self._uuid] = self
        self._f = f
        self._width = jsonable(width)
        self._style = str(style)

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

        if isinstance(layout, dict):
            # Implement the layout = {'top':, 'bottom':, 'left':,
            # 'right':} dictionary option that is in the Sage
            # notebook.  I personally think it is really awkward and
            # unsuable, but there may be many interacts out there that
            # use it.
            # Example layout={'top': [['a', 'b'], ['x', 'y']], 'left': [['c']], 'bottom': [['d']]}
            top    = layout.get('top', [])
            bottom = layout.get('bottom', [])
            left   = layout.get('left', [])
            right  = layout.get('right', [])
            new_layout = []
            for row in top:
                new_layout.append(row)
            if len(left) > 0 and len(right) > 0:
                new_layout.append(left[0] + [''] + right[0])
                del left[0]
                del right[0]
            elif len(left) > 0 and len(right) == 0:
                new_layout.append(left[0] + [''])
                del left[0]
            elif len(left) == 0 and len(right) > 0:
                new_layout.append([''] + right[0])
                del right[0]
            i = 0
            while len(left) > 0 and len(right) > 0:
                new_layout.append(left[0] + ['_salvus_'] + right[0])
                del left[0]
                del right[0]
            while len(left) > 0:
                new_layout.append(left[0])
                del left[0]
            while len(right) > 0:
                new_layout.append(right[0])
                del right[0]
            for row in bottom:
                new_layout.append(row)
            layout = new_layout

        if layout is None:
            layout = [[(str(arg), 12, None)] for arg in self._ordered_args]
        else:
            try:
                v = []
                for row in layout:
                    new_row = []
                    for x in row:
                        if isinstance(x, str):
                            x = (x,)
                        if len(x) == 1:
                            new_row.append((str(x[0]), 12//len(row), None))
                        elif len(x) == 2:
                            new_row.append((str(x[0]), int(x[1]), None))
                        elif len(x) == 3:
                            new_row.append((str(x[0]), int(x[1]), str(x[2])))
                    v.append(new_row)
                layout = v
            except:
                raise ValueError, "layout must be None or a list of tuples (variable_name, width, [optional label]), with width is an integer between 1 and 12, variable_name is a string, and label is a string.  The widths in each row must add up to at most 12. The empty string '' denotes the output area."

        # Append a row for any remaining controls:
        layout_vars = set(sum([[x[0] for x in row] for row in layout],[]))
        for v in args:
            if v not in layout_vars:
                layout.append([(v, 12, None)])

        if self._output:
            if '' not in layout_vars:
                layout.append([('', 12, None)])

        self._layout = layout

        # TODO -- this is UGLY
        if not auto_update:
            c = button('Update')
            c._opts['var'] = 'auto_update'
            self._controls['auto_update'] = c
            self._ordered_args.append("auto_update")
            layout.append([('auto_update',2)])
            update_args = ['auto_update']

        self._update_args = update_args

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
        X['style'] = self._style
        X['flicker'] = self._flicker
        return X

    def __call__(self, vals):
        """
        Call self._f with inputs specified by vals.  Any input variables not
        specified in vals will have the value they had last time.
        """
        self.changed = [str(x) for x in vals.keys()]
        for k, v in vals.iteritems():
            x = self._controls[k](v)
            self._last_vals[k] =  x

        if self._update_args is not None:
            do_it = False
            for v in self._update_args:
                if v in self.changed:
                    do_it = True
            if not do_it:
                return

        interact_exec_stack.append(self)
        try:
            self._f(**dict([(k,self._last_vals[k]) for k in self._args]))
        finally:
            interact_exec_stack.pop()

class InteractFunction(object):
    def __init__(self, interact_cell):
        self.__dict__['interact_cell'] = interact_cell

    def __setattr__(self, arg, value):
        I = self.__dict__['interact_cell']
        if arg in I._controls and not isinstance(value, control):
            # setting value of existing control
            v = I._controls[arg].convert_to_client(value)
            desc = {'var':arg, 'default':v}
            I._last_vals[arg] = value
        else:
            # create a new control
            new_control = interact_control(arg, value)
            I._controls[arg] = new_control
            desc = new_control.jsonable()
        # set the id of the containing interact
        desc['id'] = self.interact_cell._uuid
        salvus.javascript("cell._set_interact_var(obj)", obj=jsonable(desc))

    def __getattr__(self, arg):
        I = self.__dict__['interact_cell']
        try:
            return I._last_vals[arg]
        except Exception, err:
            print err
            raise AttributeError("no interact control corresponding to input variable '%s'"%arg)

    def __delattr__(self, arg):
        I = self.__dict__['interact_cell']
        try:
            del I._controls[arg]
        except KeyError:
            pass
        salvus.javascript("cell._del_interact_var(obj)", obj=jsonable(arg))

    def changed(self):
        """
        Return the variables that changed since last evaluation of the interact function
        body.  [SALVUS only]

        For example::

            @interact
            def f(n=True, m=False, xyz=[1,2,3]):
                print n, m, xyz, interact.changed()
        """
        return self.__dict__['interact_cell'].changed

class _interact_layout:
    def __init__(self, *args):
        self._args = args
    def __call__(self, f):
        return interact(f, *self._args)

class Interact(object):
    """
    Use interact to create interactive worksheet cells with sliders,
    text boxes, radio buttons, check boxes, color selectors, and more.

    Put ``@interact`` on the line before a function definition in a
    cell by itself, and choose appropriate defaults for the variable
    names to determine the types of controls (see tables below).  You
    may also put ``@interact(layout=...)`` to control the layout of
    controls.    Within the function, you may explicitly set the value
    of the control corresponding to a variable foo to bar by typing
    interact.foo = bar.

    Type "interact.controls.[tab]" to get access to all of the controls.

    INPUT:

    - ``f`` -- function
    - ``width`` -- number, or string such as '80%', '300px', '20em'.
    - ``style`` -- CSS style string, which allows you to change the border,
      background color, etc., of the interact.
    - ``update_args`` -- (default: None); list of strings, so that
      only changing the corresponding controls causes the function to
      be re-evaluated; changing other controls will not cause an update.
    - ``auto_update`` -- (default: True); if False, a button labeled
      'Update' will appear which you can click on to re-evalute.
    - ``layout`` -- (default: one control per row) a list [row0,
      row1, ...] of lists of tuples row0 = [(var_name, width,
      label), ...], where the var_name's are strings, the widths
      must add up to at most 12, and the label is optional.  This
      will layout all of the controls and output using Twitter
      Bootstraps "Fluid layout", with spans corresponding
      to the widths.   Use var_name='' to specify where the output
      goes, if you don't want it to last.  You may specify entries for
      controls that you will create later using interact.var_name = foo.


    NOTES: The flicker and layout options above are only in SALVUS.
        For backwards compatibility with the Sage notebook, if layout
        is a dictionary (with keys 'top', 'bottom', 'left', 'right'),
        then the appropriate layout will be rendered as it used to be
        in the Sage notebook.

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


    The layout option::

        @interact(layout={'top': [['a', 'b']], 'left': [['c']],
                          'bottom': [['d']], 'right':[['e']]})
        def _(a=x^2, b=(0..20), c=100, d=x+1, e=sin(2)):
            print a+b+c+d+e

    We illustrate some features that are only in Salvus, not in the
    Sage cell server or Sage notebook.

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

    We use the style option to make a holiday interact::

        @interact(width=25,
                  style="background-color:lightgreen; border:5px dashed red;")
        def f(x=button('Merry ...',width=20)):
            pass

    We make a little box that can be dragged around, resized, and is
    updated via a computation (in this case, counting primes)::

        @interact(width=30,
            style="background-color:lightorange; position:absolute; z-index:1000; box-shadow : 8px 8px 4px #888;")
        def f(prime=text_control(label="Counting primes: ")):
            salvus.javascript("cell.element.closest('.salvus-cell-output-interact').draggable().resizable()")
            p = 2
            c = 1
            while True:
                interact.prime = '%s, %.2f'%(p, float(c)/p)
                p = next_prime(p)
                c += 1
                sleep(.25)
    """
    def __call__(self, f=None, layout=None, width=None, style=None, update_args=None, auto_update=True, flicker=False, output=True):
        if f is None:
            return _interact_layout(layout, width, style, update_args, auto_update, flicker)
        else:
            return salvus.interact(f, layout=layout, width=width, style=style,
                                   update_args=update_args, auto_update=auto_update, flicker=flicker, output=output)

    def __setattr__(self, arg, value):
        I = interact_exec_stack[-1]
        if arg in I._controls and not isinstance(value, control):
            # setting value of existing control
            v = I._controls[arg].convert_to_client(value)
            desc = {'var':arg, 'default':v}
            I._last_vals[arg] = value
        else:
            # create a new control
            new_control = interact_control(arg, value)
            I._controls[arg] = new_control
            desc = new_control.jsonable()
        salvus.javascript("cell._set_interact_var(obj)", obj=desc)

    def __delattr__(self, arg):
        try:
            del interact_exec_stack[-1]._controls[arg]
        except KeyError:
            pass
        salvus.javascript("cell._del_interact_var(obj)", obj=jsonable(arg))

    def __getattr__(self, arg):
        try:
            return interact_exec_stack[-1]._last_vals[arg]
        except Exception, err:
            raise AttributeError("no interact control corresponding to input variable '%s'"%arg)

    def changed(self):
        """
        Return the variables that changed since last evaluation of the interact function
        body.  [SALVUS only]

        For example::

            @interact
            def f(n=True, m=False, xyz=[1,2,3]):
                print n, m, xyz, interact.changed()
        """
        return interact_exec_stack[-1].changed

interact = Interact()
interact_exec_stack = []

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
        try:
            return self._convert_to_client(value)
        except Exception, err:
            sys.stderr.write("%s -- %s\n"%(err, self))
            sys.stderr.flush()
            return jsonable(value)

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

def list_of_first_n(v, n):
    """Given an iterator v, return first n elements it produces as a list."""
    if not hasattr(v, 'next'):
        v = v.__iter__()
    w = []
    while n > 0:
        try:
            w.append(v.next())
        except StopIteration:
            return w
        n -= 1
    return w

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
        return color_selector(default=default, label=label)
    elif isinstance(default, tuple):
        if len(default) == 2:
            return slider(default[0], default[1], default=default_value, label=label)
        elif len(default) == 3:
            return slider(default[0], default[1], default[2], default=default_value, label=label)
        else:
            return slider(list(default), default=default_value, label=label)
    elif is_Matrix(default):
        return input_grid(default.nrows(), default.ncols(), default=default.list(), to_value=default.parent(), label=label)
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

def sage_eval(x):
    x = str(x).strip()
    if x.isspace():
        return None
    from sage.all import sage_eval
    return sage_eval(x, salvus.namespace)

class ParseValue:
    def __init__(self, type):
        self._type = type

    def _eval(self, value):
        return sage_eval(value)

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

def input_box(default=None, label=None, type=None, nrows=1, width=None, readonly=False, submit_button=None):
    """
    An input box interactive control for use with the :func:`interact` command.

    INPUT:

        - default -- default value
        - label -- label test
        - type -- the type that the input is coerced to (from string)
        - nrows -- (default: 1) the number of rows of the box
        - width -- width; how wide the box is
        - readonly -- is it read-only?
        - submit_button -- defaults to true if nrows > 1 and false otherwise.
    """
    return control(
            control_type = 'input-box',
            opts         = locals(),
            repr         = "Input box",
            convert_from_client = ParseValue(type)
        )

def checkbox(default=True, label=None, readonly=False):
    """
    A checkbox interactive control for use with the :func:`interact` command.
    """
    return control(
            control_type = 'checkbox',
            opts         = locals(),
            repr         = "Checkbox"
        )

def color_selector(default='blue', label=None, readonly=False, widget=None, hide_box=False):
    """
    A color selector.

    SALVUS only: the widget option is ignored -- SALVUS only provides
    bootstrap-colorpicker.

    EXAMPLES::

        @interact
        def f(c=color_selector()):
            print c
    """
    from sage.all import Color
    default = Color(default).html_color()
    return control(
            control_type = 'color-selector',
            opts         = locals(),
            repr         = "Color selector",
            convert_from_client = lambda x : Color(str(x)),
            convert_to_client = lambda x : Color(x).html_color()
        )

def text_control(default='', label=None, classes=None):
    """
    A read-only control that displays arbitrary HTML amongst the other
    interact controls.  This is very powerful, since it can display
    any HTML.

    INPUT::

    - ``default`` -- actual HTML to display
    - ``label`` -- string or None
    - ``classes`` -- space separated string of CSS classes

    EXAMPLES::

    We output the factorization of a number in a text_control::

        @interact
        def f(n=2013,  fact=text_control("")):
            interact.fact = factor(n)

    We use a CSS class to make the text_control look like a button:

        @interact
        def f(n=text_control("foo <b>bar</b>", classes='btn')):
            pass

    We animate a picture into view:

        @interact
        def f(size=[10,15,..,30], speed=[1,2,3,4]):
            for k in range(size):
                interact.g = text_control("<img src='http://sagemath.org/pix/sage_logo_new.png' width=%s>"%(20*k))
                sleep(speed/50.0)
    """
    return control(
            control_type = 'text',
            opts         = locals(),
            repr         = "Text %r"%(default)
        )

def button(default=None, label=None, classes=None, width=None, icon=None):
    """
    Create a button.  [SALVUS only]

    You can tell that pressing this button triggered the interact
    evaluation because interact.changed() will include the variable
    name tied to the button.

    INPUT:

    - ``default`` -- value variable is set to
    - ``label`` -- string (default: None)
    - ``classes`` -- string if None; if given, space separated
      list of CSS classes. e.g., Bootstrap CSS classes such as:
              btn-primary, btn-info, btn-success, btn-warning, btn-danger,
              btn-link, btn-large, btn-small, btn-mini.
      See http://twitter.github.com/bootstrap/base-css.html#buttons
      If button_classes a single string, that class is applied to all buttons.
    - ``width`` - an integer or string (default: None); if given,
      all buttons are this width.  If an integer, the default units
      are 'ex'.  A string that specifies any valid HTML units (e.g., '100px', '3em')
      is also allowed [SALVUS only].
    - ``icon`` -- None or string name of any icon listed at the font
      awesome website (http://fortawesome.github.com/Font-Awesome/), e.g., 'icon-repeat'

    EXAMPLES::

        @interact
        def f(hi=button('Hello', label='', classes="btn-primary btn-large"),
              by=button("By")):
            if 'hi' in interact.changed():
                print "Hello to you, good sir."
            if 'by' in interact.changed():
                print "See you."

    Some buttons with icons::

        @interact
        def f(n=button('repeat', icon='icon-repeat'),
              m=button('see?', icon="icon-eye-open", classes="btn-large")):
            print interact.changed()
    """
    return control(
            control_type = "button",
            opts         = locals(),
            repr         = "Button",
            convert_from_client = lambda x : default,
            convert_to_client   = lambda x : str(x)
    )


class Slider:
    def __init__(self, start, stop, step_size, max_steps):
        if isinstance(start, (list, tuple)):
            self.vals = start
        else:
            if step_size is None:
                if stop is None:
                    step_size = start/float(max_steps)
                else:
                    step_size = (stop-start)/float(max_steps)
            from sage.all import srange  # sage range is much better/more flexible.
            self.vals = srange(start, stop, step_size, include_endpoint=True)
        # Now check to see if any of thee above constructed a list of
        # values that exceeds max_steps -- if so, linearly interpolate:
        if len(self.vals) > max_steps:
            n = len(self.vals)//max_steps
            self.vals = [self.vals[n*i] for i in range(len(self.vals)//n)]

    def to_client(self, val):
        if val is None:
            return 0
        if isinstance(val, (list, tuple)):
            return [self.to_client(v) for v in val]
        else:
            # Find index into self.vals of closest match.
            try:
                return self.vals.index(val)  # exact match
            except ValueError:
                pass
            z = [(abs(val-x),i) for i, x in enumerate(self.vals)]
            z.sort()
            return z[0][1]

    def from_client(self, val):
        if val is None:
            return self.vals[0]
        # val can be a n-tuple or an integer
        if isinstance(val, (list, tuple)):
            return tuple([self.vals[v] for v in val])
        else:
            return self.vals[int(val)]

class InputGrid:
    def __init__(self, nrows, ncols, default, to_value):
        self.nrows    = nrows
        self.ncols    = ncols
        self.to_value = to_value
        self.value    = copy.deepcopy(self.adapt(default))

    def adapt(self, x):
        if not isinstance(x, list):
            return [[x for _ in range(self.ncols)] for _ in range(self.nrows)]
        elif not all(isinstance(elt, list) for elt in x):
            return [[x[i * self.ncols + j] for j in xrange(self.ncols)] for i in xrange(self.nrows)]
        else:
            return x

    def from_client(self, x):
        # x is a list of (unicode) strings -- we sage eval them all at once (instead of individually).
        s = '[' + ','.join([str(t) for t in x]) + ']'
        self.value = sage_eval(s)
        return self.to_value(self.value) if self.to_value is not None else self.value

    def to_client(self, x=None):
        if x is None:
            v = self.value
        else:
            v = self.adapt(x)
        self.value = v  # save value in our local cache
        return [[repr(x) for x in y] for y in v]


def input_grid(nrows, ncols, default=0, label=None, to_value=None, width=5):
    r"""
    A grid of input boxes, for use with the :func:`interact` command.

    EXAMPLES:

    Solving a system::

        @interact
        def _(m = input_grid(2,2, default = [[1,7],[3,4]],
                             label=r'$M\qquad =$', to_value=matrix, width=8),
              v = input_grid(2,1, default=[1,2],
                             label=r'$v\qquad =$', to_value=matrix)):
            try:
                x = m.solve_right(v)
                html('$$%s %s = %s$$'%(latex(m), latex(x), latex(v)))
            except:
                html('There is no solution to $$%s x=%s$$'%(latex(m), latex(v)))

    Squaring an editable and randomizable matrix::

        @interact
        def f(reset  = button('Randomize', classes="btn-primary", icon="icon-th"),
              square = button("Square", icon="icon-external-link"),
              m      = input_grid(4,4,default=0, width=5, label="m =", to_value=matrix)):
            if 'reset' in interact.changed():
                print "randomize"
                interact.m = [[random() for _ in range(4)] for _ in range(4)]
            if 'square' in interact.changed():
                salvus.tex(m^2)

    """
    ig = InputGrid(nrows, ncols, default, to_value)

    return control(
            control_type = 'input-grid',
            opts         = {'default'       : ig.to_client(),
                            'label'         : label,
                            'width'         : width,
                            'nrows'         : nrows,
                            'ncols'         : ncols},
            repr         = "Input Grid",
            convert_from_client = ig.from_client,
            convert_to_client   = ig.to_client
        )

def slider(start, stop=None, step=None, default=None, label=None,
           display_value=True, max_steps=500, step_size=None, range=False,
           width=None, animate=True):
    """
    An interactive slider control for use with :func:`interact`.

    There are several ways to call the slider function, but they all
    take several named arguments:

        - ``default`` - an object (default: None); default value is closest
          value.  If range=True, default can also be a 2-tuple (low, high).
        - ``label`` -- string
        - ``display_value`` -- bool (default: True); whether to display the
          current value to the right of the slider.
        - ``max_steps`` -- integer, default: 500; this is the maximum
          number of values that the slider can take on.  Do not make
          it too large, since it could overwhelm the client.  [SALVUS only]
        - ``range`` -- bool (default: False); instead, you can select
          a range of values (lower, higher), which are returned as a
          2-tuple.  You may also set the value of the slider or
          specify a default value using a 2-tuple.
        - ``width`` -- how wide the slider appears to the user  [SALVUS only]
        - ``animate`` -- True (default), False,"fast", "slow", or the
          duration of the animation in milliseconds.  [SALVUS only]

    You may call the slider function as follows:

    - slider([list of objects], ...) -- slider taking values the objects in the list

    - slider([start,] stop[, step]) -- slider over numbers from start
      to stop.  When step is given it specifies the increment (or
      decrement); if it is not given, then the number of steps equals
      the width of the control in pixels.  In all cases, the number of
      values will be shrunk to be at most the pixel_width, since it is
      not possible to select more than this many values using a slider.

    EXAMPLES::


    Use one slider to modify the animation speed of another::

        @interact
        def f(speed=(50,100,..,2000), x=slider([1..50], animate=1000)):
            if 'speed' in interact.triggers():
                print "change x to have speed", speed
                del interact.x
                interact.x = slider([1..50], default=interact.x, animate=speed)
                return
    """
    if step_size is not None: # for compat with sage
        step = step_size
    slider = Slider(start, stop, step, max_steps)
    vals = [str(x) for x in slider.vals]  # for display by the client
    if range and default is None:
        default = [0, len(vals)-1]
    return control(
            control_type = 'range-slider' if range else 'slider',
            opts         = {'default'       : slider.to_client(default),
                            'label'         : label,
                            'animate'       : animate,
                            'vals'          : vals,
                            'display_value' : display_value,
                            'width'         : width},
            repr         = "Slider",
            convert_from_client = slider.from_client,
            convert_to_client   = slider.to_client
        )

def range_slider(*args, **kwds):
    """
    range_slider is the same as :func:`slider`, except with range=True.

    EXAMPLES:

    A range slider with a constraint::

        @interact
        def _(t = range_slider([1..1000], default=(100,200), label=r'Choose a range for $\alpha$')):
            print t
    """
    kwds['range'] = True
    return slider(*args, **kwds)

def selector(values, label=None, default=None,
             nrows=None, ncols=None, width=None, buttons=False,
             button_classes=None):
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
          all labels must be given -- use None to auto-compute a given label.
        - ``label`` - a string (default: None); if given, this label
          is placed to the left of the entire button group
        - ``default`` - an object (default: first); default value in values list
        - ``nrows`` - an integer (default: None); if given determines
          the number of rows of buttons; if given, buttons=True
        - ``ncols`` - an integer (default: None); if given determines
          the number of columns of buttons; if given, buttons=True
        - ``width`` - an integer or string (default: None); if given,
          all buttons are this width.  If an integer, the default units
          are 'ex'.  A string that specifies any valid HTML units (e.g., '100px', '3em')
          is also allowed [SALVUS only].
        - ``buttons`` - a bool (default: False, except as noted
          above); if True, use buttons
        - ``button_classes`` - [SALVUS only] None, a string, or list of strings
          of the of same length as values, whose entries are a whitespace-separated
          string of CSS classes, e.g., Bootstrap CSS classes such as:
              btn-primary, btn-info, btn-success, btn-warning, btn-danger,
              btn-link, btn-large, btn-small, btn-mini.
          See http://twitter.github.com/bootstrap/base-css.html#buttons
          If button_classes a single string, that class is applied to all buttons.
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
interact_controls = ['button', 'checkbox', 'color_selector', 'input_box',
                     'range_slider', 'selector', 'slider', 'text_control',
                     'input_grid']

for f in ['interact'] + interact_controls:
    interact_functions[f] = globals()[f]

# A little magic so that "interact.controls.[tab]" shows all the controls.
class Controls:
    pass
Interact.controls = Controls()
for f in interact_controls:
    interact.controls.__dict__[f] = interact_functions[f]


##########################################################################################
# Cell decorators -- aka "percent modes"
##########################################################################################

import sage.misc.html
_html = sage.misc.html.HTML()

class HTML:
    def __call__(self, s, *args, **kwds):
        salvus.html(s, *args, **kwds)
    def table(self):
        pass

html = HTML()
html.iframe = _html.iframe  # written in a way that works fine


def coffeescript(s):
    """
    Execute code using CoffeeScript.

    You may either pass in a string or use this as a cell decorator,
    i.e., put %coffeescript at the top of a cell.
    """
    return salvus.coffeescript(s)

def javascript(s):
    """
    Execute code using JavaScript.

    You may either pass in a string or use this as a cell decorator,
    i.e., put %javascript at the top of a cell.
    """
    return salvus.javascript(s)

def latex0(s=None, **kwds):
    """
    Create and display an arbitrary LaTeX document as a png image in the Salvus Notebook.

    In addition to directly calling latex.eval, you may put %latex (or %latex.eval(density=75, ...etc...))
    at the top of a cell, which will typeset everything else in the cell.
    """
    if s is None:
        return lambda t : latex0(t, **kwds)
    import os
    if 'filename' not in kwds:
        import tempfile
        delete_file = True
        kwds['filename'] = tempfile.mkstemp(suffix=".png")[1]
    else:
        delete_file = False
    if 'locals' not in kwds:
        kwds['locals'] = salvus.namespace
    if 'globals' not in kwds:
        kwds['globals'] = salvus.namespace
    sage.misc.latex.Latex.eval(sage.misc.latex.latex, s, **kwds)
    salvus.file(kwds['filename'], once=False)
    if delete_file:
        os.unlink(kwds['filename'])
    return ''

latex0.__doc__ +=  sage.misc.latex.Latex.eval.__doc__


class Time:
    """
    Time execution of code exactly once in Salvus by:

    - putting %time at the top of a cell to time execution of the entire cell
    - put %time at the beginning of line to time execution of just that line
    - write time('some code') to executation of the contents of the string.

    If you want to time repeated execution of code for benchmarking purposes, use
    the timeit command instead.
    """
    def __init__(self, start=False):
        if start:
            from sage.all import walltime, cputime
            self._start_walltime = walltime()
            self._start_cputime = cputime()

    def before(self, code):
        return Time(start=True)

    def after(self, code):
        from sage.all import walltime, cputime
        print "CPU time: %.2f s, Wall time: %.2f s"%(walltime(self._start_walltime), cputime(self._start_cputime))
        self._start_cputime = self._start_walltime = None

    def __call__(self, code):
        from sage.all import walltime, cputime
        not_as_decorator = self._start_cputime is None
        if not_as_decorator:
            self.before(code)
        salvus.execute(code)
        if not_as_decorator:
            self.after(code)

time = Time()


def file(path):
    """
    Block decorator to write to a file.  Use as follows:

        %file('filename') put this line in the file

    or

        %file('filename')
        everything in the rest of the
        cell goes into the file with given name.


    As with all block decorators in Salvus, the arguments to file can
    be an arbitrary expression.  For examples,

        a = 'file'; b = ['name', 'txt']

        %file(a+b[0]+'.'+b[1])  rest of line goes in 'filename.txt'
    """
    return lambda content: open(path,'w').write(content)


def timeit(*args, **kwds):
    """
    Time execution of a command or block of commands.  This command has been
    enhanced for Salvus so you may use it as a block decorator as well, e.g.,

        %timeit 2+3

    and

        %timeit(number=10, preparse=False)  2^3

    and

        %timeit(preparse=False)

        [rest of the cell]

    Here is the original docstring for timeit:

    """
    def go(code, **kwds):
        print sage.misc.sage_timeit.sage_timeit(code, globals_dict=salvus.namespace, **kwds)
    if len(args) == 0:
        return lambda code : go(code, **kwds)
    else:
        go(*args)

# TODO: these need to also give the argspec
timeit.__doc__ += sage.misc.sage_timeit.sage_timeit.__doc__


class Capture:
    """
    Capture or ignore the output from evaluating the given code. (SALVUS only).

    Use capture as a block decorator by placing either %capture or
    %capture(optional args) at the beginning of a cell or at the
    beginning of a line.  If you use just plane %capture then stdout
    and stderr are completely ignored.  If you use %capture(args)
    you can redirect or echo stdout and stderr to variables or
    files.  For example if you start a cell with this line::

       %capture(stdout='output', stderr=open('error','w'), append=True, echo=True)

    then stdout is appended (because append=True) to the global
    variable output, stderr is written to the file 'error', and the
    output is still displayed in the output portion of the cell (echo=True).

    INPUT:

    - stdout -- string (or object with write method) to send stdout output to (string=name of variable)
    - stderr -- string (or object with write method) to send stderr output to (string=name of variable)
    - append -- (default: False) if stdout/stderr are a string, append to corresponding variable
    - echo   -- (default: False) if True, also echo stdout/stderr to the output cell.
    """
    def __init__(self, stdout, stderr, append, echo):
        self.v = (stdout, stderr, append, echo)

    def before(self, code):
        (stdout, stderr, append, echo) = self.v
        self._orig_stdout_f = orig_stdout_f = sys.stdout._f
        if stdout is not None:
            if hasattr(stdout, 'write'):
                def write_stdout(buf):
                    stdout.write(buf)
            elif isinstance(stdout, str):
                if (stdout not in salvus.namespace) or not append:
                    salvus.namespace[stdout] = ''
                if not isinstance(salvus.namespace[stdout], str):
                    salvus.namespace[stdout] = str(salvus.namespace[stdout])
                def write_stdout(buf):
                    salvus.namespace[stdout] += buf
            else:
                raise TypeError, "stdout must be None, a string, or have a write method"
            def f(buf, done):
                write_stdout(buf)
                if echo:
                    orig_stdout_f(buf, done)
                elif done:
                    orig_stdout_f('', done)
            sys.stdout._f = f
        elif not echo:
            def f(buf,done):
                if done:
                    orig_stdout_f('',done)
            sys.stdout._f = f

        self._orig_stderr_f = orig_stderr_f = sys.stderr._f
        if stderr is not None:
            if hasattr(stderr, 'write'):
                def write_stderr(buf):
                    stderr.write(buf)
            elif isinstance(stderr, str):
                if (stderr not in salvus.namespace) or not append:
                    salvus.namespace[stderr] = ''
                if not isinstance(salvus.namespace[stderr], str):
                    salvus.namespace[stderr] = str(salvus.namespace[stderr])
                def write_stderr(buf):
                    salvus.namespace[stderr] += buf
            else:
                raise TypeError, "stderr must be None, a string, or have a write method"
            def f(buf, done):
                write_stderr(buf)
                if echo:
                    orig_stderr_f(buf, done)
                elif done:
                    orig_stderr_f('', done)
            sys.stderr._f = f
        elif not echo:
            def f(buf,done):
                if done:
                    orig_stderr_f('',done)
            sys.stderr._f = f


        return self

    def __call__(self, code=None, stdout=None, stderr=None, append=False, echo=False):
        if code is None:
            return Capture(stdout=stdout, stderr=stderr, append=append, echo=echo)
        salvus.execute(code)


    def after(self, code):
        sys.stdout._f = self._orig_stdout_f
        sys.stderr._f = self._orig_stderr_f


capture = Capture(stdout=None, stderr=None, append=False, echo=False)


def cython(code=None, **kwds):
    """
    Block decorator to easily include Cython code in the Salvus notebook.

    Just put %cython at the top of a cell, and the rest is compiled as Cython code.
    You can pass options to cython by typing "%cython(... var=value...)" instead.

    This is a wrapper around Sage's cython function, whose docstring is:


    """
    if code is None:
        return lambda code: cython(code, **kwds)
    import sage.misc.misc
    path = sage.misc.misc.tmp_dir()
    filename = os.path.join(path, 'a.pyx')
    open(filename, 'w').write(code)

    if 'annotate' not in kwds:
        kwds['annotate'] = True
    import sage.misc.cython
    modname, path = sage.misc.cython.cython(filename, **kwds)

    try:
    	sys.path.insert(0,path)
    	module = __import__(modname)
    finally:
    	del sys.path[0]

    import inspect
    for name, value in inspect.getmembers(module):
        if not name.startswith('_'):
            salvus.namespace[name] = value

    files = os.listdir(path)
    html_filename = None
    for n in files:
        ext = os.path.splitext(n)[1]
        if ext.startswith('.html'):
            html_filename = os.path.join(path, n)
    if html_filename is not None:
        html_url = salvus.file(html_filename, show=False)
        salvus.html("<a href='%s' target='_new' class='btn btn-small '>Show auto-generated code >> </a>"%html_url)

cython.__doc__ += sage.misc.cython.cython.__doc__


class script:
    r"""
    Block decorator to run an arbitrary shell command with input from a
    cell in Salvus.

    Put %script('shell command line') or %script(['command', 'arg1',
    'arg2', ...])  by itself on a line in a cell, and the command line
    is run with stdin the rest of the contents of the cell.  You can
    also use script in single line mode, e.g.,::

        %script('gp -q') factor(2^97 - 1)

    or

        %script(['gp', '-q'])   factor(2^97 - 1)

    will launch a gp session, feed 'factor(2^97-1)' into stdin, and
    display the resulting factorization.

    NOTE: the result is stored in the attribute "stdout", so you can do::

        s = script('gp -q')
        %s factor(2^97-1)
        s.stdout
        '\n[11447 1]\n\n[13842607235828485645766393 1]\n\n'

    and s.stdout will now be the output string.

    You may also specify the shell environment with the env keyword.
    """
    def __init__(self, args, env=None):
        self._args = args
        self._env = env
    def __call__(self, code=''):
        import subprocess
        try:
            s = None
            s = subprocess.Popen(self._args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, shell=isinstance(self._args, str),
                                 env=self._env)
            s.stdin.write(code); s.stdin.close()
        finally:
            if s is None:
                return
            try:
                self.stdout = s.stdout.read()
                sys.stdout.write(self.stdout)
            finally:
                try:
                    os.system("pkill -TERM -P %s"%s.pid)
                except OSError:
                    pass
               	try:
                    os.kill(s.pid, 9)
                except OSError:
                    pass

def python(code):
    """
    Block decorator to run code in pure Python mode, without it being
    preparsed by the Sage preparser.  Otherwise, nothing changes.

    To use this, put %python by itself in a cell so that it applies to
    the rest of the cell, or put it at the beginning of a line to
    disable preparsing just for that line.
    """
    salvus.execute(code, preparse=False)

def python3(code):
    """
    Block decorator to run code in a pure Python3 mode session.

    To use this, put %python3 by itself in a cell so that it applies to
    the rest of the cell, or put it at the beginning of a line to
    run just that line using python3.

    You can combine %python3 with capture, if you would like to capture
    the output to a variable.  For example::

        %capture(stdout='p3')
        %python3
        x = set([1,2,3])
        print(x)

    Afterwards, p3 contains the output '{1, 2, 3}' and the variable x
    in the controlling Sage session is in no way impacted.

    NOTE: No state is preserved between calls.  Each call is a separate process.
    """
    script('sage-native-execute python3 -E')(code)

def perl(code):
    """
    Block decorator to run code in a Perl session.

    To use this, put %perl by itself in a cell so that it applies to
    the rest of the cell, or put it at the beginning of a line to
    run just that line using perl.

    EXAMPLE:

    A perl cell::

        %perl
        $apple_count = 5;
        $count_report = "There are $apple_count apples.";
        print "The report is: $count_report\n";

    Or use %perl on one line::

        %perl  $apple_count = 5;  $count_report = "There are $apple_count apples."; print "The report is: $count_report\n";

    You can combine %perl with capture, if you would like to capture
    the output to a variable.  For example::

        %capture(stdout='p')
        %perl print "hi"

    Afterwards, p contains 'hi'.

    NOTE: No state is preserved between calls.  Each call is a separate process.
    """
    script('sage-native-execute perl')(code)


def ruby(code):
    """
    Block decorator to run code in a Ruby session.

    To use this, put %ruby by itself in a cell so that it applies to
    the rest of the cell, or put it at the beginning of a line to
    run just that line using ruby.

    EXAMPLE:

    A ruby cell::

        %ruby
        lang = "ruby"
        print "Hello from #{lang}!"

    Or use %ruby on one line::

        %ruby lang = "ruby"; print "Hello from #{lang}!"

    You can combine %ruby with capture, if you would like to capture
    the output to a variable.  For example::

        %capture(stdout='p')
        %ruby lang = "ruby"; print "Hello from #{lang}!"

    Afterwards, p contains 'Hello from ruby!'.

    NOTE: No state is preserved between calls.  Each call is a separate process.
    """
    script('sage-native-execute ruby')(code)

def sh(code):
    """
    Run a bash script in Salvus.

    EXAMPLES:

    Use as a block decorator on a single line::

        %sh pwd

    and multiline

        %sh
        echo "hi"
        pwd
        ls -l

    You can also just directly call it::

        sh('pwd')

    The output is printed. To capture it, use capture

        %capture(stdout='output')
        %sh pwd

    After that, the variable output contains the current directory
    """
    return script('/bin/bash')(code)


def prun(code):
    """
    Use %prun followed by a block of code to profile execution of that
    code.  This will display the resulting profile, along with a menu
    to select how to sort the data.

    EXAMPLES:

    Profile computing a tricky integral (on a single line)::

        %prun integrate(sin(x^2),x)

    Profile a block of code::

        %prun
        E = EllipticCurve([1..5])
        v = E.anlist(10^5)
        r = E.rank()
    """
    import cProfile, pstats
    from sage.misc.all import tmp_filename

    filename = tmp_filename()
    cProfile.runctx(salvus.namespace['preparse'](code), salvus.namespace, locals(), filename)

    @interact
    def f(title = text_control('', "<h1>Salvus Profiler</h1>"),
          sort=("First sort by", selector([('calls', 'number of calls to the function'),
                                     ('time', ' total time spent in the function'),
                                     ('cumulative', 'total time spent in this and all subfunctions (from invocation till exit)'),
                                     ('module', 'name of the module that contains the function'),
                                     ('name', 'name of the function')
                                     ], width="100%", default='time')),
          strip_dirs=True):
        try:
            p = pstats.Stats(filename)
            if strip_dirs:
                p.strip_dirs()
            p.sort_stats(sort)
            p.print_stats()
        except Exception, msg:
            print msg



##############################################################
# The %fork cell decorator.
##############################################################

def _wait_in_thread(pid, callback, filename):
    from sage.structure.sage_object import load
    def wait():
        try:
            os.waitpid(pid,0)
            callback(load(filename))
        except Exception, msg:
        	callback(msg)

    from threading import Thread
    t = Thread(target=wait, args=tuple([]))
    t.start()

def async(f, args, kwds, callback):
    """
    Run f in a forked subprocess with given args and kwds, then call the
    callback function when f terminates.
    """
    from sage.misc.all import tmp_filename
    filename = tmp_filename() + '.sobj'
    sys.stdout.flush()
    sys.stderr.flush()
    pid = os.fork()
    if pid:
        # The parent master process
        try:
            _wait_in_thread(pid, callback, filename)
            return pid
        finally:
            if os.path.exists(filename):
                os.unlink(filename)
    else:
        # The child process
        try:
            result = f(*args, **kwds)
        except Exception, msg:
            result = str(msg)
        from sage.structure.sage_object import save
        save(result, filename)
        os._exit(0)


class Fork(object):
    """
    The %fork block decorator evaluates its code in a forked subprocess
    that does not block the main process.

    WARNING: This is highly experimental and possibly flakie. Use with
    caution.

    All (picklelable) global variables that are set in the forked
    subprocess are set in the parent when the forked subprocess
    terminates.  However, the forked subprocess has no other side
    effects, except what it might do to file handles and the
    filesystem.

    To see currently running forked subprocesses, type
    fork.children(), which returns a dictionary {pid:execute_uuid}.
    To kill a given subprocess and stop the cell waiting for input,
    type fork.kill(pid).  This is currently the only way to stop code
    running in %fork cells.

    TODO/WARNING: The subprocesses spawned by fork are not killed
    if the parent process is killed first!

    NOTE: All pexpect interfaces are reset in the child process.
    """
    def __init__(self):
        self._children = {}

    def children(self):
        return dict(self._children)

    def __call__(self, s):
        salvus._done = False

        id = salvus._id

        changed_vars = set([])

        def change(var, val):
            changed_vars.add(var)

        def f():
            # Run some commands to tell Sage that its
            # pid has changed.
            import sage.misc.misc
            reload(sage.misc.misc)

            # The pexpect interfaces (and objects defined in them) are
            # not valid.
            sage.interfaces.quit.invalidate_all()

            salvus.namespace.on('change', None, change)
            salvus.execute(s)
            result = {}
            from sage.structure.sage_object import dumps
            for var in changed_vars:
                try:
                    result[var] = dumps(salvus.namespace[var])
                except:
                    result[var] = 'unable to pickle %s'%var
            return result


        from sage.structure.sage_object import loads
        def g(s):
            if isinstance(s, Exception):
                sys.stderr.write(str(s))
                sys.stderr.flush()
            else:
                for var, val in s.iteritems():
                    try:
                        salvus.namespace[var] = loads(val)
                    except:
                        print "unable to unpickle %s"%var
            salvus._conn.send_json({'event':'output', 'id':id, 'done':True})
            if pid in self._children:
                del self._children[pid]

        pid = async(f, tuple([]), {}, g)
        print "Forked subprocess %s"%pid
        self._children[pid] = id

    def kill(self, pid):
        if pid in self._children:
            salvus._conn.send_json({'event':'output', 'id':self._children[pid], 'done':True})
            os.kill(pid, 9)
            del self._children[pid]
        else:
            raise ValueError, "Unknown pid = (%s)"%pid

fork = Fork()


####################################################
# Display of 2d graphics objects
####################################################

from sage.misc.all import tmp_filename

def show_2d_plot(obj, svg, **kwds):
    t = tmp_filename(ext = '.svg' if svg else '.png')
    obj.save(t, **kwds)
    salvus.file(t)

def show_3d_plot(obj, **kwds):
    t = tmp_filename(ext = '.png')
    obj.save(t, **kwds)
    salvus.file(t)

from sage.plot.graphics import Graphics, GraphicsArray
from sage.plot.plot3d.base import Graphics3d

def show(obj, svg=True, **kwds):
    if isinstance(obj, (Graphics, GraphicsArray)):
        show_2d_plot(obj, svg=svg, **kwds)
    elif isinstance(obj, Graphics3d):
        show_3d_plot(obj, **kwds)
    else:
        salvus.tex(obj, display=True, **kwds)

# Make it so plots plot themselves correctly when they call their repr.
Graphics.show = show

###################################################
# %auto -- automatically evaluate a cell on load
###################################################
def auto(s):
    """
    Put %auto as the first line of a cell, and that code in that cell
    will be executed when the cell is loaded.  Thus %auto allows you
    to initialize functions, variables, interacts, etc., e.g., when
    loading a worksheet.
    """
    return s # the do-nothing block decorator.


class Cell(object):
    def id(self):
        """
        Return the UUID of the cell in which this function is called.
        """
        return salvus._id

    def hide(self, component='editor'):
        """
        Hide a component of the cell in which this code is called.  By
        default, hide hides the the code editor part of the cell, but
        you can show other parts by passing in an optional argument:

              'editor', 'note', 'output'

        Use the unhide function to reveal a cell component.
        """
        if component not in ['editor', 'note', 'output']:
            raise ValueError, "component must be one of 'editor', 'note', 'output'."
        salvus.javascript("cell.hide('%s')"%component)

    def show(self, component='editor'):
        """
        Show a component of the cell in which this code is called.  By
        default, show shows the the code editor part of the cell, but
        you can show other parts by passing in an optional argument:

              'editor', 'note', 'output'
        """
        if component not in ['editor', 'note', 'output']:
            raise ValueError, "component must be one of 'editor', 'note', 'output'."
        salvus.javascript("cell.show('%s')"%component)

    def hideall(self):
        """
        Hide the note, editor, and output fields of the cell in which this code executes.
        """
        salvus.javascript("cell.hide('note'); cell.hide('editor'); cell.hide('output'); cell.hide('insert')")

    def note(self, val=None):
        """
        Get or set the value of the note component of the cell in
        which this code executes.
        """
        return salvus.note(val, self._id)

    def editor(self, val=None):
        """
        Get or set the value of the code editor component of the cell in
        which this code executes.
        """
        return salvus.editor(val, self._id)

    def output(self, val=None):
        """
        Get or set the value of the output component of the cell in
        which this code executes.
        """
        return salvus.output(val, self._id)

cell = Cell()

def hide(component='editor'):
    """
    Hide a component of a cell.  By default, hide hides the the code
    editor part of the cell, but you can hide other parts by passing
    in an optional argument:

              'editor', 'note', 'output'

    Use the cell.show(...) function to reveal a cell component.
    """
    if component not in ['editor', 'note', 'output']:
        # Allow %hide to work, for compatability with sagenb.
        hide('editor')
        return component
    cell.hide(component)


def hideall(code=None):
    cell.hideall()
    if code is not None: # for backwards compat with sagenb
        return code



##########################################################
# A "%exercise" cell mode -- a first step toward
# automated homework.
##########################################################
class Exercise:
    def __init__(self, question, answer, check=None, hints=None):
        import sage.all, sage.matrix.all
        if not (isinstance(answer, (tuple, list)) and len(answer) == 2):
            if sage.matrix.all.is_Matrix(answer):
                default = sage.all.parent(answer)(0)
            else:
                default = ''
            answer = [answer, default]

        if check is None:
            R = sage.all.parent(answer[0])
            def check(attempt):
                return R(attempt) == answer[0]

        if hints is None:
            hints = ['','','',"The answer is %s."%answer[0]]

        self._question       = question
        self._answer         = answer
        self._check          = check
        self._hints          = hints

    def _check_attempt(self, attempt, interact):
        from sage.misc.all import walltime
        response = "<div class='well'>"
        try:
            r = self._check(attempt)
            if isinstance(r, tuple) and len(r)==2:
                correct = r[0]
                comment = r[1]
            else:
                correct = bool(r)
                comment = ''
        except TypeError, msg:
            response += "<h3 style='color:darkgreen'>Huh? -- %s (attempt=%s)</h3>"%(msg, attempt)
        else:
            if correct:
                response += "<h1 style='color:blue'>RIGHT!</h1>"
                if self._start_time:
                    response += "<h2 class='lighten'>Time: %.1f seconds</h2>"%(walltime()-self._start_time,)
                if self._number_of_attempts == 1:
                    response += "<h3 class='lighten'>You got it first try!</h3>"
                else:
                    response += "<h3 class='lighten'>It took you %s attempts.</h3>"%(self._number_of_attempts,)
            else:
                response += "<h3 style='color:darkgreen'>Not correct yet...</h3>"
                if self._number_of_attempts == 1:
                    response += "<h4 style='lighten'>(first attempt)</h4>"
                else:
                    response += "<h4 style='lighten'>(%s attempts)</h4>"%self._number_of_attempts

                if self._number_of_attempts > len(self._hints):
                    hint = self._hints[-1]
                else:
                    hint = self._hints[self._number_of_attempts-1]
                if hint:
                    response += "<span class='lighten'>(HINT: %s)</span>"%(hint,)
            if comment:
                response += '<h4>%s</h4>'%comment

        response += "</div>"

        interact.feedback = text_control(response,label='')

        return correct

    def ask(self, cb):
        from sage.misc.all import walltime
        self._start_time = walltime()
        self._number_of_attempts = 0
        attempts = []
        @interact(layout=[[('question',12)],[('attempt',12)], [('feedback',12)]])
        def f(question = ("<b>Question:</b>", text_control(self._question)),
              attempt   = ('<b>Answer:</b>',self._answer[1])):
            if 'attempt' in interact.changed() and attempt != '':
                attempts.append(attempt)
                if self._start_time == 0:
                    self._start_time = walltime()
                self._number_of_attempts += 1
                if self._check_attempt(attempt, interact):
                    cb({'attempts':attempts, 'time':walltime()-self._start_time})

def exercise(code):
    r"""
    Use the %exercise cell decorator to create interactive exercise
    sets.  Put %exercise at the top of the cell, then write Sage code
    in the cell that defines the following (all are optional):

    - a ``question`` variable, as an HTML string with math in dollar
      signs

    - an ``answer`` variable, which can be any object, or a pair
      (correct_value, interact control) -- see the docstring for
      interact for controls.

    - an optional callable ``check(answer)`` that returns a boolean or
      a 2-tuple

            (True or False, message),

      where the first argument is True if the answer is correct, and
      the optional second argument is a message that should be
      displayed in response to the given answer.  NOTE: Often the
      input "answer" will be a string, so you may have to use Integer,
      RealNumber, or sage_eval to evaluate it, depending
      on what you want to allow the user to do.

    - hints -- optional list of strings to display in sequence each
      time the user enters a wrong answer.  The last string is
      displayed repeatedly.  If hints is omitted, the correct answer
      is displayed after three attempts.

    NOTE: The code that defines the exercise is executed so that it
    does not impact (and is not impacted by) the global scope of your
    variables elsewhere in your session.  Thus you can have many
    %exercise cells in a single worksheet with no interference between
    them.

    The following examples further illustrate how %exercise works.

    An exercise to test your ability to sum the first $n$ integers::

        %exercise
        title    = "Sum the first n integers, like Gauss did."
        n        = randint(3, 100)
        question = "What is the sum $1 + 2 + \\cdots + %s$ of the first %s positive integers?"%(n,n)
        answer   = n*(n+1)//2

    Transpose a matrix::

        %exercise
        title    = r"Transpose a $2 \times 2$ Matrix"
        A        = random_matrix(ZZ,2)
        question = "What is the transpose of $%s?$"%latex(A)
        answer   = A.transpose()

    Add together a few numbers::

        %exercise
        k        = randint(2,5)
        title    = "Add %s numbers"%k
        v        = [randint(1,10) for _ in range(k)]
        question = "What is the sum $%s$?"%(' + '.join([str(x) for x in v]))
        answer   = sum(v)

    The trace of a matrix::

        %exercise
        title    = "Compute the trace of a matrix."
        A        = random_matrix(ZZ, 3, x=-5, y = 5)^2
        question = "What is the trace of $$%s?$$"%latex(A)
        answer   = A.trace()

    Some basic arithmetic with hints and dynamic feedback::

        %exercise
        k        = randint(2,5)
        title    = "Add %s numbers"%k
        v        = [randint(1,10) for _ in range(k)]
        question = "What is the sum $%s$?"%(' + '.join([str(x) for x in v]))
        answer   = sum(v)
        hints    = ['This is basic arithmetic.', 'The sum is near %s.'%(answer+randint(1,5)), "The answer is %s."%answer]
        def check(attempt):
            c = Integer(attempt) - answer
            if c == 0:
                return True
            if abs(c) >= 10:
                return False, "Gees -- not even close!"
            if c < 0:
                return False, "too low"
            if c > 0:
                return False, "too high"
    """
    f = closure(code)
    def g():
        x = f()
        return x.get('title',''), x.get('question', ''), x.get('answer',''), x.get('check',None), x.get('hints',None)

    title, question, answer, check, hints = g()
    obj = {}
    obj['E'] = Exercise(question, answer, check, hints)
    obj['title'] = title
    def title_control(t):
        return text_control('<h3 class="lighten">%s</h3>'%t)

    the_times = []
    @interact(layout=[[('go',1), ('title',11,'')],[('')], [('times',12, "<b>Times:</b>")]], flicker=True)
    def h(go    = button("&nbsp;"*5 + "Go" + "&nbsp;"*7, label='', icon='icon-refresh', classes="btn-large btn-success"),
          title = title_control(title),
          times = text_control('')):
        c = interact.changed()
        if 'go' in c or 'another' in c:
            interact.title = title_control(obj['title'])
            def cb(obj):
                the_times.append("%.1f"%obj['time'])
                h.times = ', '.join(the_times)

            obj['E'].ask(cb)

            title, question, answer, check, hints = g()   # get ready for next time.
            obj['title'] = title
            obj['E'] = Exercise(question, answer, check, hints)

def closure(code):
    """
    Wrap the given code block (a string) in a closure, i.e., a
    function with an obfuscated random name.

    When called, the function returns locals().
    """
    import uuid
    # TODO: strip string literals first
    code = ' ' + ('\n '.join(code.splitlines()))
    fname = "__" + str(uuid.uuid4()).replace('-','_')
    closure = "def %s():\n%s\n return locals()"%(fname, code)
    class Closure:
        def __call__(self):
            return self._f()
    c = Closure()
    salvus.execute(closure)
    c._f = salvus.namespace[fname]
    del salvus.namespace[fname]
    return c


#########################################
# Dynamic variables (linked to controls)
#########################################

def _dynamic(var, control=None):
    if control is None:
        control = salvus.namespace.get(var,'')

    @interact(layout=[[(var,12)]], output=False)
    def f(x=(var,control)):
        salvus.namespace.set(var, x, do_not_trigger=[var])

    def g(y):
        f.x = y
    salvus.namespace.on('change', var, g)

    if var in salvus.namespace:
        x = salvus.namespace[var]

def dynamic(*args, **kwds):
    """
    Make variables in the global namespace dynamically linked to a control from the
    interact label (see the documentation for interact).

    EXAMPLES:

    Make a control linked to a variable that doesn't yet exist::

         dynamic('xyz')

    Make a slider and a selector, linked to t and x::

         dynamic(t=(1..10), x=[1,2,3,4])
         t = 5          # this changes the control
    """
    for var in args:
        if not isinstance(var, str):
            i = id(var)
            for k,v in salvus.namespace.iteritems():
                if id(v) == i:
                    _dynamic(k)
            return
        else:
            _dynamic(var)

    for var, control in kwds.iteritems():
        _dynamic(var, control)


import sage.all
def var(args, **kwds):
    """
    Create symbolic variables and inject them into the global namespace.

    NOTE: In SageCloud, you can use var as a line decorator::

        %var x
        %var a,b,theta          # separate with commas
        %var x y z t            # separate with spaces

    Here is the docstring for var in Sage:

    """
    if len(args)==1:
        name = args[0]
    else:
        name = args
    G = salvus.namespace
    v = sage.all.SR.var(name, **kwds)
    if isinstance(v, tuple):
        for x in v:
            G[repr(x)] = x
    else:
        G[repr(v)] = v
    return v

var.__doc__ += sage.all.var.__doc__


#############################################
# Variable reset -- we have to rewrite
# this because of all the monkey patching
# that we do.
#############################################

import sage.misc.reset

def reset(vars=None, attached=False):
    """
    If vars is specified, just restore the value of vars and leave
    all other variables alone.   In SageCloud, you can also use
    reset as a line decorator::

         %reset x, pi, sin   # comma-separated
         %reset x pi sin     # commas are optional

    If vars is not given, delete all user-defined variables, reset
    all global variables back to their default states, and reset
    all interfaces to other computer algebra systems.

    Original reset docstring::

    """
    if vars is not None:
        restore(vars)
        return
    G = salvus.namespace
    T = type(sys)  # module type
    for k in G.keys():
        if k[0] != '_' and type(k) != T:
            try:
                del G[k]
            except KeyError:
                pass
    restore()
    from sage.symbolic.assumptions import forget; forget()
    sage.misc.reset.reset_interfaces()
    if attached:
        sage.misc.reset.reset_attached()

reset.__doc__ += sage.misc.reset.reset.__doc__

def restore(vars=None):
    ""
    if isinstance(vars, unicode):
        vars = str(vars)   # sage.misc.reset is unicode ignorant
        if ',' in vars:    # sage.misc.reset is stupid about commas and space -- TODO: make a patch to sage
            vars = [v.strip() for v in vars.split(',')]
    import sage.calculus.calculus
    sage.misc.reset._restore(salvus.namespace, default_namespace, vars)
    sage.misc.reset._restore(sage.calculus.calculus.syms_cur, sage.calculus.calculus.syms_default, vars)

restore.__doc__ += sage.misc.reset.restore.__doc__


def md(s):
    """
    Cell mode that renders everything after %md as markdown.
    """
    import markdown2
    html(markdown2.markdown(s))