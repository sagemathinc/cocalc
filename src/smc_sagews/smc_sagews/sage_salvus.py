##################################################################################
#                                                                                #
# Extra code that the Salvus server makes available in the running Sage session. #
#                                                                                #
##################################################################################

#########################################################################################
#       Copyright (C) 2016, Sagemath Inc.
#                                                                                       #
#  Distributed under the terms of the GNU General Public License (GPL), version 2+      #
#                                                                                       #
#                  http://www.gnu.org/licenses/                                         #
#########################################################################################


import copy, os, sys, types, re

import sage.all


def is_dataframe(obj):
    if 'pandas' not in str(type(obj)):
        # avoid having to import pandas unless it's really likely to be necessary.
        return
    # CRITICAL: do not import pandas at the top level since it can take up to 3s -- it's **HORRIBLE**.
    try:
        from pandas import DataFrame
    except:
        return False
    return isinstance(obj, DataFrame)

# This reduces a lot of confusion for Sage worksheets -- people expect
# to be able to import from the current working directory.
sys.path.append('.')

salvus = None
def set_salvus(salvus_obj):
    global salvus
    salvus = salvus_obj
    import sage_jupyter
    sage_jupyter.salvus = salvus_obj

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
    def __init__(self, f, layout=None, width=None, style=None,
                 update_args=None, auto_update=True,
                 flicker=False, output=True):
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
          (or one of the arguments in update_args).
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
                raise ValueError("layout must be None or a list of tuples (variable_name, width, [optional label]), where width is an integer between 1 and 12, variable_name is a string, and label is a string.  The widths in each row must add up to at most 12. The empty string '' denotes the output area.")

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

    def __call__(self, **kwds):
        salvus.clear()
        for arg, value in kwds.iteritems():
            self.__setattr__(arg, value)
        return self.interact_cell(kwds)

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
        desc['id'] = I._uuid
        salvus.javascript("worksheet.set_interact_var(obj)", obj=jsonable(desc))

    def __getattr__(self, arg):
        I = self.__dict__['interact_cell']
        try:
            return I._last_vals[arg]
        except Exception as err:
            print(err)
            raise AttributeError("no interact control corresponding to input variable '%s'"%arg)

    def __delattr__(self, arg):
        I = self.__dict__['interact_cell']
        try:
            del I._controls[arg]
        except KeyError:
            pass
        desc = {'id':I._uuid, 'name':arg}
        salvus.javascript("worksheet.del_interact_var(obj)", obj=jsonable(desc))

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
            print(a+b+c+d+e)

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
            print(kwds)
            n = Integer(n)
            if n % 2 == 1:
                del interact.half
            else:
                interact.half = input_box(n/2, readonly=True)
            if n.is_prime():
                interact.is_prime = input_box('True', readonly=True)
            else:
                del interact.is_prime

    We illustrate not automatically updating the function until a
    button is pressed::

        @interact(auto_update=False)
        def f(a=True, b=False):
            print a, b

    You can access the value of a control associated to a variable foo
    that you create using interact.foo, and check whether there is a
    control associated to a given variable name using hasattr::

        @interact
        def f():
            if not hasattr(interact, 'foo'):
                interact.foo = 'hello'
            else:
                print(interact.foo)

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
        desc['id'] = I._uuid
        salvus.javascript("worksheet.set_interact_var(obj)", obj=desc)

    def __delattr__(self, arg):
        try:
            del interact_exec_stack[-1]._controls[arg]
        except KeyError:
            pass
        desc['id'] = I._uuid
        salvus.javascript("worksheet.del_interact_var(obj)", obj=jsonable(arg))

    def __getattr__(self, arg):
        try:
            return interact_exec_stack[-1]._last_vals[arg]
        except Exception as err:
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
        except Exception as err:
            sys.stderr.write("convert_to_client: %s -- %s\n"%(err, self))
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
            except Exception as err:
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

import types, inspect

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
    from sage.all import Color
    from sage.structure.element import is_Matrix
    label = None
    default_value = None

    for _ in range(2):
        if isinstance(default, tuple) and len(default) == 2 and isinstance(default[0], str):
            label, default = default
        if isinstance(default, tuple) and len(default) == 2 and hasattr(default[1],'__iter__'):
            default_value, default = default

    if isinstance(default, control):
        if label:
            default._opts['label'] = label
        return default
    elif isinstance(default, str):
        return input_box(default, label=label, type=str)
    elif isinstance(default, unicode):
        return input_box(default, label=label, type=unicode)
    elif isinstance(default, bool):
        return checkbox(default, label=label)
    elif isinstance(default, list):
        return selector(default, default=default_value, label=label, buttons=len(default) <= 5)
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
    elif hasattr(default, '__iter__'):
        return slider(list_of_first_n(default, 10000), default=default_value, label=label)
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

def sage_eval(x, locals=None, **kwds):
    if isinstance(x, str):
        x = str(x).strip()
        if x.isspace():
            return None
    from sage.all import sage_eval
    return sage_eval(x, locals=locals, **kwds)

class ParseValue:
    def __init__(self, type):
        self._type = type

    def _eval(self, value):
        if isinstance(value, (str, unicode)):
            if not value:
                return ''
            return sage_eval(value, locals=None if salvus is None else salvus.namespace)
        else:
            return value

    def __call__(self, value):
        from sage.all import Color
        if self._type is None:
            return self._eval(value)
        elif self._type is str:
            return str(value)
        elif self._type is unicode:
            return unicode(value)
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
            print(c)
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
      awesome website (http://fortawesome.github.com/Font-Awesome/), e.g., 'fa-repeat'

    EXAMPLES::

        @interact
        def f(hi=button('Hello', label='', classes="btn-primary btn-large"),
              by=button("By")):
            if 'hi' in interact.changed():
                print("Hello to you, good sir.")
            if 'by' in interact.changed():
                print("See you.")

    Some buttons with icons::

        @interact
        def f(n=button('repeat', icon='fa-repeat'),
              m=button('see?', icon="fa-eye", classes="btn-large")):
            print(interact.changed())
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
        if len(x) == 0:
            self.value = []
        elif isinstance(x[0], list):
            self.value = [[sage_eval(t) for t in z] for z in x]
        else:
            # x is a list of (unicode) strings -- we sage eval them all at once (instead of individually).
            s = '[' + ','.join([str(t) for t in x]) + ']'
            v = sage_eval(s)
            self.value = [v[n:n+self.ncols] for n in range(0, self.nrows*self.ncols, self.ncols)]

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

    INPUT:

    - ``nrows`` - an integer
    - ``ncols`` - an integer
    - ``default`` - an object; the default put in this input box
    - ``label`` - a string; the label rendered to the left of the box.
    - ``to_value`` - a list; the grid output (list of rows) is
      sent through this function.  This may reformat the data or
      coerce the type.
    - ``width`` - an integer; size of each input box in characters

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
        def f(reset  = button('Randomize', classes="btn-primary", icon="fa-th"),
              square = button("Square", icon="fa-external-link"),
              m      = input_grid(4,4,default=0, width=5, label="m =", to_value=matrix)):
            if 'reset' in interact.changed():
                print("randomize")
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
                print("change x to have speed {}".format(speed))
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
            print(t)
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
# Cell object -- programatically control the current cell.
##########################################################################################


class Cell(object):
    def id(self):
        """
        Return the UUID of the cell in which this function is called.
        """
        return salvus._id

    def hide(self, component='input'):
        """
        Hide the 'input' or 'output' component of a cell.
        """
        salvus.hide(component)

    def show(self, component='input'):
        """
        Show the 'input' or 'output' component of a cell.
        """
        salvus.show(component)

    def hideall(self):
        """
        Hide the input and output fields of the cell in which this code executes.
        """
        salvus.hide('input')
        salvus.hide('output')

    #def input(self, val=None):
    #    """
    #    Get or set the value of the input component of the cell in
    #    which this code executes.
    #    """
    #    salvus.javascript("cell.set_input(obj)", obj=val)
    #
    #def output(self, val=None):
    #    """
    #    Get or set the value of the output component of the cell in
    #    which this code executes.
    #    """
    #    salvus.javascript("cell.set_output(obj)", obj=val)
    #    return salvus.output(val, self._id)

cell = Cell()

##########################################################################################
# Cell decorators -- aka "percent modes"
##########################################################################################

import sage.misc.html
try:
    _html = sage.misc.html.HTML()
except:
    _html = sage.misc.html.HTMLFragmentFactory

class HTML:
    """
    Cell mode that renders everything after %html as HTML

    EXAMPLES::

        ---
        %html
        <h1>A Title</h1>
        <h2>Subtitle</h2>

        ---
        %html(hide=True)
        <h1>A Title</h1>
        <h2>Subtitle</h2>

        ---
        %html("<h1>A title</h1>", hide=False)

        ---
        %html(hide=False) <h1>Title</h1>

    """
    def __init__(self, hide=False):
        self._hide = hide

    def __call__(self, *args, **kwds):
        if len(kwds) > 0 and len(args) == 0:
            return HTML(**kwds)
        if len(args) > 0:
            self._render(args[0], **kwds)

    def _render(self, s, hide=None):
        if hide is None:
            hide = self._hide
        if hide:
            salvus.hide('input')
        salvus.html(s)

    def table(self, rows = None, header=False):
        """
        Renders a given matrix or nested list as an HTML table.

        Arguments::

        * **rows**: the rows of the table as a list of lists
        * **header**: if True, the first row is formatted as a header (default: False)
        """
        # TODO: support columns as in http://doc.sagemath.org/html/en/reference/misc/sage/misc/table.html
        assert rows is not None, '"rows" is a mandatory argument, should be a list of lists'

        from sage.matrix.matrix import is_Matrix
        import numpy as np

        if is_Matrix(rows):
            table = list(rows) # list of Sage Vectors
        elif isinstance(rows, np.ndarray):
            table = rows.tolist()
        else:
            table = rows

        assert isinstance(table, (tuple, list)), '"rows" must be a list of lists'

        def as_unicode(s):
            '''
            This not only deals with unicode strings, but also converts e.g. `Integer` objects to a str
            '''
            if not isinstance(s, unicode):
                try:
                    return unicode(s, 'utf8')
                except:
                    return unicode(str(s), 'utf8')
            return s

        def mk_row(row, header=False):
            is_vector = hasattr(row, 'is_vector') and row.is_vector()
            assert isinstance(row, (tuple, list)) or is_vector, '"rows" must contain lists or vectors for each row'
            tag = 'th' if header else 'td'
            row = [u'<{tag}>{}</{tag}>'.format(as_unicode(_), tag = tag) for _ in row]
            return u'<tr>{}</tr>'.format(u''.join(row))

        thead = u'<thead>{}</thead>'.format(mk_row(table.pop(0), header=True)) if header else ''
        h_rows = [mk_row(row) for row in table]
        html_table = u'<table style="width: auto;" class="table table-bordered">{}<tbody>{}</tbody></table>'
        self(html_table.format(thead, ''.join(h_rows)))

html = HTML()
html.iframe = _html.iframe  # written in a way that works fine

def coffeescript(s=None, once=False):
    """
    Execute code using CoffeeScript.

    For example:

         %coffeescript console.log 'hi'

    or

         coffeescript("console.log 'hi'")

    You may either pass in a string or use this as a cell decorator,
    i.e., put %coffeescript at the top of a cell.

    If you set once=False, the code will be executed every time the output of the cell is rendered, e.g.,
    on load, like with %auto::

         coffeescript('console.log("hi")', once=False)

    or

         %coffeescript(once=False)
         console.log("hi")


    EXTRA FUNCTIONALITY:

    When executing code, a function called print is defined, and objects cell and worksheet.::

         print(1,2,'foo','bar')  -- displays the inputs in the output cell

         cell -- has attributes cell.output (the html output box) and cell.cell_id

         worksheet -- has attributes project_page and editor, and methods interrupt, kill, and

            execute_code: (opts) =>
                opts = defaults opts,
                    code     : required
                    data     : undefined
                    preparse : true
                    cb       : undefined

    OPTIMIZATION: When used alone as a cell decorator in a Sage worksheet
    with once=False (the default), rendering is done entirely client side,
    which is much faster, not requiring a round-trip to the server.
    """
    if s is None:
        return lambda s : salvus.javascript(s, once=once, coffeescript=True)
    else:
        return salvus.javascript(s, coffeescript=True, once=once)

def javascript(s=None, once=False):
    """
    Execute code using JavaScript.

    For example:

         %javascript console.log('hi')

    or

         javascript("console.log('hi')")


    You may either pass in a string or use this as a cell decorator,
    i.e., put %javascript at the top of a cell.

    If once=False (the default), the code will be executed every time the output of the
    cell is rendered, e.g., on load, like with %auto::

         javascript('.. some code ', once=False)

    or

         %javascript(once=False)
         ... some code

    WARNING: If once=True, then this code is likely to get executed *before* the rest
    of the output for this cell has been rendered by the client.

         javascript('console.log("HI")', once=False)

    EXTRA FUNCTIONALITY:

    When executing code, a function called print is defined, and objects cell and worksheet.::

         print(1,2,'foo','bar')  -- displays the inputs in the output cell

         cell -- has attributes cell.output (the html output box) and cell.cell_id

         worksheet -- has attributes project_page and editor, and methods interrupt, kill, and

            execute_code: (opts) =>
                opts = defaults opts,
                    code     : required
                    data     : undefined
                    preparse : true
                    cb       : undefined

    This example illustrates using worksheet.execute_code::

        %coffeescript
        for i in [500..505]
            worksheet.execute_code
                code : "i=salvus.data['i']; i, factor(i)"
                data : {i:i}
                cb   : (mesg) ->
                    if mesg.stdout then print(mesg.stdout)
                    if mesg.stderr then print(mesg.stderr)

    OPTIMIZATION: When used alone as a cell decorator in a Sage worksheet
    with once=False (the default), rendering is done entirely client side,
    which is much faster, not requiring a round-trip to the server.
    """
    if s is None:
        return lambda s : salvus.javascript(s, once=once)
    else:
        return salvus.javascript(s, once=once)

javascript_exec_doc = r"""

To send code from Javascript back to the Python process to
be executed use the worksheet.execute_code function::

    %javascript  worksheet.execute_code(string_to_execute)

You may also use a more general call format of the form::

    %javascript
    worksheet.execute_code({code:string_to_execute, data:jsonable_object,
                            preparse:true or false, cb:function});

The data object is available when the string_to_execute is being
evaluated as salvus.data.  For example, if you execute this code
in a cell::

    javascript('''
        worksheet.execute_code({code:"a = salvus.data['b']/2; print(a)", data:{b:5},
                       preparse:false, cb:function(mesg) { console.log(mesg)} });
    ''')

then the Python variable a is set to 2, and the Javascript console log will display::

    Object {done: false, event: "output", id: "..."}
    Object {stdout: "2\n", done: true, event: "output", id: "..."}

You can also send an interrupt signal to the Python process from
Javascript by calling worksheet.interrupt(), and kill the process
with worksheet.kill().  For example, here the a=4 never
happens (but a=2 does)::

    %javascript
    worksheet.execute_code({code:'a=2; sleep(100); a=4;',
                            cb:function(mesg) { worksheet.interrupt(); console.log(mesg)}})

or using CoffeeScript (a Javascript preparser)::

    %coffeescript
    worksheet.execute_code
        code : 'a=2; sleep(100); a=4;'
        cb   : (mesg) ->
            worksheet.interrupt()
            console.log(mesg)

The Javascript code is evaluated with numerous standard Javascript libraries available,
including jQuery, Twitter Bootstrap, jQueryUI, etc.

"""

for s in [coffeescript, javascript]:
    s.__doc__ += javascript_exec_doc

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
        print("\nCPU time: %.2f s, Wall time: %.2f s" % (cputime(self._start_cputime), walltime(self._start_walltime)))
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
    be arbitrary expressions.  For examples,

        a = 'file'; b = ['name', 'txt']

        %file(a+b[0]+'.'+b[1])  rest of line goes in 'filename.txt'
    """
    return lambda content: open(path,'w').write(content)


def timeit(*args, **kwds):
    """
    Time execution of a command or block of commands.

    This command has been enhanced for Salvus so you may use it as
    a block decorator as well, e.g.,

        %timeit 2+3

    and

        %timeit(number=10, preparse=False)  2^3

        %timeit(number=10, seconds=True)  2^3

    and

        %timeit(preparse=False)

        [rest of the cell]

    Here is the original docstring for timeit:

    """
    def go(code):
        print(sage.misc.sage_timeit.sage_timeit(code, globals_dict=salvus.namespace, **kwds))
    if len(args) == 0:
        return lambda code : go(code)
    else:
        go(*args)

# TODO: these need to also give the argspec
timeit.__doc__ += sage.misc.sage_timeit.sage_timeit.__doc__


class Capture:
    """
    Capture or ignore the output from evaluating the given code. (SALVUS only).

    Use capture as a block decorator by placing either %capture or
    %capture(optional args) at the beginning of a cell or at the
    beginning of a line.  If you use just plain %capture then stdout
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
                raise TypeError("stdout must be None, a string, or have a write method")
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
                raise TypeError("stderr must be None, a string, or have a write method")
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
        if salvus._prefix:
            if not code.startswith("%"):
                code = salvus._prefix + '\n' + code
        salvus.execute(code)


    def after(self, code):
        sys.stdout._f = self._orig_stdout_f
        sys.stderr._f = self._orig_stderr_f


capture = Capture(stdout=None, stderr=None, append=False, echo=False)

import sage.misc.cython

def cython(code=None, **kwds):
    """
    Block decorator to easily include Cython code in SageMathCloud worksheets.

    Put %cython at the top of a cell, and the rest of that cell is compiled as
    Cython code and made directly available to use in other cells.

    You can pass options to cython by typing "%cython(... var=value...)"
    instead of just "%cython".

    If you give the option silent=True (not the default) then this won't
    print what functions get globally defined as a result of evaluating code.

    This is a wrapper around Sage's own cython function, whose
    docstring is below:

    ORIGINAL DOCSTRING:

    """
    if code is None:
        return lambda code: cython(code, **kwds)
    from sage.misc.temporary_file import tmp_dir
    path = tmp_dir()
    filename = os.path.join(path, 'a.pyx')
    open(filename, 'w').write(code)

    silent = kwds.get('silent', False)
    if 'silent' in kwds:
        del kwds['silent']

    if 'annotate' not in kwds and not silent:
        kwds['annotate'] = True

    modname, path = sage.misc.cython.cython(filename, **kwds)

    try:
    	sys.path.insert(0,path)
    	module = __import__(modname)
    finally:
    	del sys.path[0]

    import inspect
    defined = []
    for name, value in inspect.getmembers(module):
        if not name.startswith('_') and name != 'init_memory_functions':
            salvus.namespace[name] = value
            defined.append(name)
    if not silent:
        if defined:
            print("Defined %s" % (', '.join(defined)))
        else:
            print("No functions defined.")

    files = os.listdir(path)
    html_filename = None
    for n in files:
        base, ext = os.path.splitext(n)
        if ext.startswith('.html') and '_pyx_' in base:
            html_filename = os.path.join(path, n)
    if html_filename is not None:
        salvus.file(html_filename, raw=True, show=True, text="Auto-generated code...")

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

def python3(code=None,**kwargs):
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

    .. note::

        State is preserved between cells.
        SMC %python3 mode uses the jupyter `anaconda3` kernel.
    """
    if python3.jupyter_kernel is None:
        python3.jupyter_kernel = jupyter("anaconda3")
    return python3.jupyter_kernel(code,**kwargs)
python3.jupyter_kernel = None

def singular_kernel(code=None,**kwargs):
    """
    Block decorator to run code in a Singular mode session.

    To use this, put %singular_kernel by itself in a cell so that it applies to
    the rest of the cell, or put it at the beginning of a line to
    run just that line using singular_kernel.

    State is preserved between cells.

    This is completely different than the singular command in Sage itself, which
    supports things like x = singular(sage_object), and *also* provides a way
    to execute code by beginning cells with %singular. The singular interface in
    Sage uses pexpect, so might be less robust than singular_kernel.

    .. note::

        SMC %singular_kernel mode uses the jupyter `singular` kernel:
        https://github.com/sebasguts/jupyter_kernel_singular
    """
    if singular_kernel.jupyter_kernel is None:
        singular_kernel.jupyter_kernel = jupyter("singular")
    return singular_kernel.jupyter_kernel(code,**kwargs)
singular_kernel.jupyter_kernel = None

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


def fortran(x, library_paths=[], libraries=[], verbose=False):
    """
    Compile Fortran code and make it available to use.

    INPUT:

        - x -- a string containing code

    Use this as a decorator.   For example, put this in a cell and evaluate it::

        %fortran

        C FILE: FIB1.F
              SUBROUTINE FIB(A,N)
        C
        C     CALCULATE FIRST N FIBONACCI NUMBERS
        C
              INTEGER N
              REAL*8 A(N)
              DO I=1,N
                 IF (I.EQ.1) THEN
                    A(I) = 0.0D0
                 ELSEIF (I.EQ.2) THEN
                    A(I) = 1.0D0
                 ELSE
                    A(I) = A(I-1) + A(I-2)
                 ENDIF
              ENDDO
              END
        C END FILE FIB1.F


    In the next cell, evaluate this::

        import numpy
        n = numpy.array(range(10),dtype=float)
        fib(n,int(10))
        n

    This will produce this output: array([  0.,   1.,   1.,   2.,   3.,   5.,   8.,  13.,  21.,  34.])
    """
    import __builtin__
    from sage.misc.temporary_file import tmp_dir
    if len(x.splitlines()) == 1 and os.path.exists(x):
        filename = x
        x = open(x).read()
        if filename.lower().endswith('.f90'):
            x = '!f90\n' + x

    from numpy import f2py
    from random import randint

    # Create everything in a temporary directory
    mytmpdir = tmp_dir()

    try:
        old_cwd = os.getcwd()
        os.chdir(mytmpdir)

        old_import_path = os.sys.path
        os.sys.path.append(mytmpdir)

        name = "fortran_module_%s"%randint(0,2**64)  # Python module name
        # if the first line has !f90 as a comment, gfortran will
        # treat it as Fortran 90 code
        if x.startswith('!f90'):
            fortran_file = name + '.f90'
        else:
            fortran_file = name + '.f'

        s_lib_path = ""
        s_lib = ""
        for s in library_paths:
            s_lib_path = s_lib_path + "-L%s "

        for s in libraries:
            s_lib = s_lib + "-l%s "%s

        log = name + ".log"
        extra_args = '--quiet --f77exec=sage-inline-fortran --f90exec=sage-inline-fortran %s %s >"%s" 2>&1'%(
            s_lib_path, s_lib, log)

        f2py.compile(x, name, extra_args = extra_args, source_fn=fortran_file)
        log_string = open(log).read()

        # f2py.compile() doesn't raise any exception if it fails.
        # So we manually check whether the compiled file exists.
        # NOTE: the .so extension is used expect on Cygwin,
        # that is even on OS X where .dylib might be expected.
        soname = name
        uname = os.uname()[0].lower()
        if uname[:6] == "cygwin":
            soname += '.dll'
        else:
            soname += '.so'
        if not os.path.isfile(soname):
            raise RuntimeError("failed to compile Fortran code:\n" + log_string)

        if verbose:
            print(log_string)

        m = __builtin__.__import__(name)

    finally:
        os.sys.path = old_import_path
        os.chdir(old_cwd)
        try:
            import shutil
            shutil.rmtree(mytmpdir)
        except OSError:
            # This can fail for example over NFS
            pass

    for k, x in m.__dict__.iteritems():
        if k[0] != '_':
            salvus.namespace[k] = x

def sh(code=None,**kwargs):
    """
    Run a bash script in Salvus. Uses jupyter bash kernel
    which allows keeping state between cells.

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

    Remember shell state between cells

        %sh
        FOO='xyz'
        cd /tmp
        ... new cell will show settings from previous cell ...
        %sh
        echo $FOO
        pwd

    Display image file (this is a feature of jupyter bash kernel)

        %sh
        display < sage_logo.png

    .. WARNING::

        The jupyter bash kernel does not separate stdout and stderr as cell is running.
        It only returns ok or error depending on exit status of last command in the cell.
        So all cell output captured goes to either stdout or stderr variable, depending
        on exit status of the last command in the %sh cell.
    """
    if sh.jupyter_kernel is None:
        sh.jupyter_kernel = jupyter("bash")
        sh.jupyter_kernel('function command_not_found_handle { printf "%s: command not found\n" "$1" >&2; return 127;}')
    return sh.jupyter_kernel(code,**kwargs)
sh.jupyter_kernel = None

# use jupyter kernel for GNU octave instead of sage interpreter interface
def octave(code=None,**kwargs):
    r"""
    Run GNU Octave code in a sage worksheet.

    INPUT:

    - ``code`` -- a string containing code

    Use as a decorator. For example, put this in a cell and evaluate it::

        %octave
        x = -10:0.1:10;
        plot (x, sin (x))

    .. note::

        SMC %octave mode uses the jupyter `octave` kernel.
    """
    if octave.jupyter_kernel is None:
        octave.jupyter_kernel = jupyter("octave")
        octave.jupyter_kernel.smc_image_scaling = 1
    return octave.jupyter_kernel(code,**kwargs)
octave.jupyter_kernel = None

# jupyter kernel for %ir mode
def r(code=None,**kwargs):
    r"""
    Run R code in a sage worksheet.

    INPUT:

    - ``code`` -- a string containing code

    Use as a decorator. For example, put this in a cell and evaluate it to see a scatter plot
    of built-in mtcars dataframe variables `mpg` vs `wt`::

        %r
        with(mtcars,plot(wt,mpg))

    .. note::

        SMC %r mode uses the jupyter `ir` kernel.
    """
    if r.jupyter_kernel is None:
        r.jupyter_kernel = jupyter("ir")
        r.jupyter_kernel('options(repr.plot.res = 240)')
        r.jupyter_kernel.smc_image_scaling = .5
    return r.jupyter_kernel(code,**kwargs)
r.jupyter_kernel = None

# jupyter kernel for %scala mode
def scala211(code=None,**kwargs):
    r"""
    Run scala code in a sage worksheet.

    INPUT:

    - ``code`` -- a string containing code

    Use as a decorator.

    .. note::

        SMC %scala211 mode uses the jupyter `scala211` kernel.
    """
    if scala211.jupyter_kernel is None:
        scala211.jupyter_kernel = jupyter("scala211")
    return scala211.jupyter_kernel(code,**kwargs)
scala211.jupyter_kernel = None
# add alias for generic scala
scala = scala211

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
        except Exception as msg:
            print(msg)



##############################################################
# The %fork cell decorator.
##############################################################

def _wait_in_thread(pid, callback, filename):
    from sage.structure.sage_object import load
    def wait():
        try:
            os.waitpid(pid,0)
            callback(load(filename))
        except Exception as msg:
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
        except Exception as msg:
            result = str(msg)
        from sage.structure.sage_object import save
        save(result, filename)
        os._exit(0)


class Fork(object):
    """
    The %fork block decorator evaluates its code in a forked subprocess
    that does not block the main process.

    You may still use the @fork function decorator from Sage, as usual,
    to run a function in a subprocess.  Type "sage.all.fork?" to see
    the help for the @fork decorator.

    WARNING: This is highly experimental and possibly flaky. Use with
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

        if isinstance(s, types.FunctionType): # check for decorator usage
            import sage.parallel.decorate
            return sage.parallel.decorate.fork(s)

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
                        print("unable to unpickle %s" % var)
            salvus._conn.send_json({'event':'output', 'id':id, 'done':True})
            if pid in self._children:
                del self._children[pid]

        pid = async(f, tuple([]), {}, g)
        print("Forked subprocess %s" % pid)
        self._children[pid] = id

    def kill(self, pid):
        if pid in self._children:
            salvus._conn.send_json({'event':'output', 'id':self._children[pid], 'done':True})
            os.kill(pid, 9)
            del self._children[pid]
        else:
            raise ValueError("Unknown pid = (%s)" % pid)

fork = Fork()


####################################################
# Display of 2d/3d graphics objects
####################################################

from sage.misc.all import tmp_filename
from sage.plot.animate import Animation
import matplotlib.figure

def show_animation(obj, delay=20, gif=False, **kwds):
    if gif:
        t = tmp_filename(ext='.gif')
        obj.gif(delay, t, **kwds)
        salvus.file(t, raw=False)
        os.unlink(t)
    else:
        t = tmp_filename(ext='.webm')
        obj.ffmpeg(t, delay=delay, **kwds)
        salvus.file(t, raw=True)   # and let delete when worksheet ends - need this so can replay video.

def show_2d_plot_using_matplotlib(obj, svg, **kwds):
    if isinstance(obj, matplotlib.image.AxesImage):
        # The result of imshow, e.g.,
        #
        #     from matplotlib import numpy, pyplot
        #     pyplot.imshow(numpy.random.random_integers(255, size=(100,100,3)))
        #
        t = tmp_filename(ext='.png')
        obj.write_png(t)
        salvus.file(t)
        os.unlink(t)
        return

    if isinstance(obj, matplotlib.axes.Axes):
        obj = obj.get_figure()

    if 'events' in kwds:
        from graphics import InteractiveGraphics
        ig = InteractiveGraphics(obj, **kwds['events'])
        n = '__a'+uuid().replace('-','')  # so it doesn't get garbage collected instantly.
        obj.__setattr__(n, ig)
        kwds2 = dict(kwds)
        del kwds2['events']
        ig.show(**kwds2)
    else:
        t = tmp_filename(ext = '.svg' if svg else '.png')
        if isinstance(obj, matplotlib.figure.Figure):
            obj.savefig(t, **kwds)
        else:
            obj.save(t, **kwds)
        salvus.file(t)
        os.unlink(t)

def show_3d_plot_using_tachyon(obj, **kwds):
    t = tmp_filename(ext = '.png')
    obj.save(t, **kwds)
    salvus.file(t)
    os.unlink(t)

def show_graph_using_d3(obj, **kwds):
    salvus.d3_graph(obj, **kwds)


def plot3d_using_matplotlib(expr, rangeX, rangeY,
                            density=40, elev=45., azim=35.,
                            alpha=0.85, cmap=None):
    """
    Plots a symbolic expression in two variables on a two dimensional grid
    and renders the function using matplotlib's 3D projection.
    The purpose is to make it possible to create vectorized images (PDF, SVG)
    for high-resolution images in publications -- instead of rasterized image formats.

    Example::
        %var x y
        plot3d_using_matplotlib(x^2 + (1-y^2), (x, -5, 5), (y, -5, 5))

    Arguments::

        * expr: symbolic expression, e.g. x^2 - (1-y)^2
        * rangeX: triple: (variable, minimum, maximum), e.g. (x, -10, 10)
        * rangeY: like rangeX
        * density: grid density
        * elev: elevation, e.g. 45
        * azim: azimuth, e.g. 35
        * alpha: alpha transparency of plot (default: 0.85)
        * cmap: matplotlib colormap, e.g. matplotlib.cm.Blues (default)
    """
    from matplotlib import cm
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import axes3d
    import numpy as np

    cmap = cmap or cm.Blues

    plt.cla()
    fig = plt.figure()
    ax = fig.gca(projection='3d')
    ax.view_init(elev=elev, azim=azim)

    xx = np.linspace(rangeX[1], rangeX[2], density)
    yy = np.linspace(rangeY[1], rangeY[2], density)
    X, Y = np.meshgrid(xx, yy)

    import numpy as np
    exprv = np.vectorize(lambda x1, x2 : \
        float(expr.subs({rangeX[0] : x1, rangeY[0] : x2})))
    Z = exprv(X, Y)
    zlim = np.min(Z), np.max(Z)

    ax.plot_surface(X, Y, Z, alpha=alpha, cmap=cmap, linewidth=.5,
                    shade=True,
                    rstride=int(len(xx)/10),
                    cstride=int(len(yy)/10))

    ax.set_xlabel('X')
    ax.set_xlim(*rangeX[1:])
    ax.set_ylabel('Y')
    ax.set_ylim(*rangeY[1:])
    ax.set_zlabel('Z')
    ax.set_zlim(*zlim)

    plt.show()


from sage.plot.graphics import Graphics, GraphicsArray
from sage.plot.plot3d.base import Graphics3d
import cgi

def show(*objs, **kwds):
    """
    Show a 2d or 3d graphics object (or objects), animation, or matplotlib figure, or show an
    expression typeset nicely using LaTeX.

       - display: (default: True); if True, use display math for expression (big and centered).

       - svg: (default: True); if True, show 2d plots using svg (otherwise use png)

       - d3: (default: True); if True, show graphs (vertices and edges) using an interactive D3 viewer
         for the many options for this viewer, type

             import smc_sagews.graphics
             smc_sagews.graphics.graph_to_d3_jsonable?

         If false, graphs are converted to plots and displayed as usual.

       - renderer: (default: 'webgl'); for 3d graphics
           - 'webgl' (fastest) using hardware accelerated 3d;
           - 'canvas' (slower) using a 2d canvas, but may work better with transparency;
           - 'tachyon' -- a ray traced static image.

       - spin: (default: False); spins 3d plot, with number determining speed (requires mouse over plot)

       - events: if given, {'click':foo, 'mousemove':bar}; each time the user clicks,
         the function foo is called with a 2-tuple (x,y) where they clicked.  Similarly
         for mousemove.  This works for Sage 2d graphics and matplotlib figures.

    ANIMATIONS:

       - animations are by default encoded and displayed using an efficiently web-friendly
         format (currently webm, which is **not supported** by Safari or IE).

            - ``delay`` - integer (default: 20); delay in hundredths of a
              second between frames.

            - gif=False -- if you set gif=True, instead use an animated gif,
              which is much less efficient, but works on all browsers.

         You can also use options directly to the animate command, e.g., the figsize option below:

              a = animate([plot(sin(x + a), (x, 0, 2*pi)) for a in [0, pi/4, .., 2*pi]], figsize=6)
              show(a, delay=30)


    EXAMPLES:

    Some examples:

        show(2/3)
        show([1, 4/5, pi^2 + e], 1+pi)
        show(x^2, display=False)
        show(e, plot(sin))

    Here's an example that illustrates creating a clickable image with events::

        @interact
        def f0(fun=x*sin(x^2), mousemove='', click='(0,0)'):
            click = sage_eval(click)
            g = plot(fun, (x,0,5), zorder=0) + point(click, color='red', pointsize=100, zorder=10)
            ymax = g.ymax(); ymin = g.ymin()
            m = fun.derivative(x)(x=click[0])
            b =  fun(x=click[0]) - m*click[0]
            g += plot(m*x + b, (click[0]-1,click[0]+1), color='red', zorder=10)
            def h(p):
                f0.mousemove = p
            def c(p):
                f0(click=p)
            show(g, events={'click':c, 'mousemove':h}, svg=True, gridlines='major', ymin=ymin, ymax=ymax)
    """
    # svg=True, d3=True,
    svg = kwds.get('svg',True)
    d3 = kwds.get('d3',True)
    display = kwds.get('display', True)
    for t in ['svg', 'd3', 'display']:
        if t in kwds:
            del kwds[t]
    import graphics
    def show0(obj, combine_all=False):
        # Either show the object and return None or
        # return a string of html to represent obj.
        if isinstance(obj, (Graphics, GraphicsArray, matplotlib.figure.Figure, matplotlib.axes.Axes, matplotlib.image.AxesImage)):
            show_2d_plot_using_matplotlib(obj, svg=svg, **kwds)
        elif isinstance(obj, Animation):
            show_animation(obj, **kwds)
        elif isinstance(obj, Graphics3d):
            if kwds.get('viewer') == 'tachyon':
                show_3d_plot_using_tachyon(obj, **kwds)
            else:
                salvus.threed(obj, **kwds)
                # graphics.show_3d_plot_using_threejs(obj, **kwds)
        elif isinstance(obj, (sage.graphs.graph.Graph, sage.graphs.digraph.DiGraph)):
            if d3:
                show_graph_using_d3(obj, **kwds)
            else:
                show(obj.plot(), **kwds)
        elif isinstance(obj, str):
            return obj
        elif isinstance(obj, (list, tuple)):
            v = []
            for a in obj:
                b = show0(a)
                if b is not None:
                    v.append(b)
            if combine_all:
                return ' '.join(v)
            s = ', '.join(v)
            if isinstance(obj, list):
                return '[%s]'%s
            else:
                return '(%s)'%s
        elif is_dataframe(obj):
            html(obj.to_html(), hide=False)
        else:
            s = str(sage.misc.latex.latex(obj))
            if r'\text{\texttt' in s and 'tikzpicture' not in s:
                # In this case the mathjax latex mess is so bad, it is better to just print and give up!
                print(obj)
                return
            # Add anything here that Sage produces and mathjax can't handle, and
            # which people complain about... (obviously, I wish there were a way to
            # know -- e.g., if Sage had a way to tell whether latex it produces
            # will work with mathjax or not).
            if '\\begin{tikzpicture}' in s or '\\raisebox' in s:
                # special case -- mathjax has no support for tikz or \raisebox so we just immediately display it (as a png); this is
                # better than nothing.
                sage.misc.latex.latex.eval(s)
                return ''
            elif r'\begin{tabular}' in s:
                # tabular is an environment for text, not formular.
                # Sage's `tabular` should actually use \array!
                sage.misc.latex.latex.eval(s)
                return ''
            # default
            elif display:
                return "$\\displaystyle %s$"%s
            else:
                return "$%s$"%s
    sys.stdout.flush()
    sys.stderr.flush()
    s = show0(objs, combine_all=True)
    if s is not None:
        if len(s) > 0:
            if display:
                salvus.html("<div align='center'>%s</div>"%cgi.escape(s))
            else:
                salvus.html("<div>%s</div>"%cgi.escape(s))
        sys.stdout.flush()
        sys.stderr.flush()

# Make it so plots plot themselves correctly when they call their repr.
Graphics.show = show
GraphicsArray.show = show
Animation.show = show

# Very "evil" abuse of the display manager, so sphere().show() works:
try:
    from sage.repl.rich_output import get_display_manager
    get_display_manager().display_immediately = show
except:
    # so doesn't crash on older versions of Sage.
    pass

###################################################
# %auto -- automatically evaluate a cell on load
###################################################
def auto(s):
    """
    The %auto decorator sets a cell so that it will be automatically
    executed when the Sage process first starts.  Make it the first
    line of a cell.

    Thus %auto allows you to initialize functions, variables, interacts,
    etc., e.g., when loading a worksheet.
    """
    return s # the do-nothing block decorator.

def hide(component='input'):
    """
    Hide a component of a cell.  By default, hide hides the the code
    editor part of the cell, but you can hide other parts by passing
    in an optional argument:

              'input', 'output'

    Use the cell.show(...) function to reveal a cell component.
    """
    if component not in ['input', 'output']:
        # Allow %hide to work, for compatability with sagenb.
        hide('input')
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
        import sage.all
        from sage.structure.element import is_Matrix
        if not (isinstance(answer, (tuple, list)) and len(answer) == 2):
            if is_Matrix(answer):
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
        except TypeError as msg:
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
    def h(go    = button("&nbsp;"*5 + "Go" + "&nbsp;"*7, label='', icon='fa-refresh', classes="btn-large btn-success"),
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

def var0(*args, **kwds):
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

def var(*args, **kwds):
    """
    Create symbolic variables and inject them into the global namespace.

    NOTE: In SageMathCloud, you can use var as a line decorator::

        %var x
        %var a,b,theta          # separate with commas
        %var x y z t            # separate with spaces

    Use latex_name to customizing how the variables is typeset:

        var1 = var('var1', latex_name=r'\sigma^2_1')
        show(e^(var1**2))

    Multicolored variables made using the %var line decorator:

        %var(latex_name=r"\color{green}{\theta}") theta
        %var(latex_name=r"\color{red}{S_{u,i}}") sui
        show(expand((sui + x^3 + theta)^2))



    Here is the docstring for var in Sage:

    """
    if 'latex_name' in kwds:
        # wrap with braces -- sage should probably do this, but whatever.
        kwds['latex_name'] = '{%s}'%kwds['latex_name']
    if len(args) > 0:
        return var0(*args, **kwds)
    else:
        def f(s):
            return var0(s, *args, **kwds)
        return f

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
    all other variables alone.   In SageMathCloud, you can also use
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
    # reset() adds 'pretty_print' and 'view' to show_identifiers()
    # user can shadow these and they will appear in show_identifiers()
    # 'sage_salvus' is added when the following line runs; user may not shadow it
    exec('sage.misc.session.state_at_init = dict(globals())',salvus.namespace)

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

# NOTE: this is not used anymore
def md2html(s):
    from markdown2Mathjax import sanitizeInput, reconstructMath
    from markdown2 import markdown

    delims = [('\\(','\\)'), ('$$','$$'), ('\\[','\\]'),
              ('\\begin{equation}', '\\end{equation}'), ('\\begin{equation*}', '\\end{equation*}'),
              ('\\begin{align}', '\\end{align}'), ('\\begin{align*}', '\\end{align*}'),
              ('\\begin{eqnarray}', '\\end{eqnarray}'), ('\\begin{eqnarray*}', '\\end{eqnarray*}'),
              ('\\begin{math}', '\\end{math}'),
              ('\\begin{displaymath}', '\\end{displaymath}')
              ]

    tmp = [((s,None),None)]
    for d in delims:
        tmp.append((sanitizeInput(tmp[-1][0][0], equation_delims=d), d))

    extras = ['code-friendly', 'footnotes', 'smarty-pants', 'wiki-tables']
    markedDownText = markdown(tmp[-1][0][0], extras=extras)

    while len(tmp) > 1:
        markedDownText = reconstructMath(markedDownText, tmp[-1][0][1], equation_delims=tmp[-1][1])
        del tmp[-1]

    return markedDownText

# NOTE: this is not used anymore
class Markdown(object):
    r"""
    Cell mode that renders everything after %md as markdown.

    EXAMPLES::

        ---
        %md
        # A Title

        ## A subheading

        ---
        %md(hide=True)
        # A title

        - a list

        ---
        md("# A title")


        ---
        %md `some code`


    This uses the Python markdown2 library with the following
    extras enabled:

         'code-friendly', 'footnotes',
         'smarty-pants', 'wiki-tables'

    See https://github.com/trentm/python-markdown2/wiki/Extras
    We also use markdown2Mathjax so that LaTeX will be properly
    typeset if it is wrapped in $'s and $$'s, \(, \), \[, \],
    \begin{equation}, \end{equation}, \begin{align}, \end{align}.,
    """
    def __init__(self, hide=False):
        self._hide = hide

    def __call__(self, *args, **kwds):
        if len(kwds) > 0 and len(args) == 0:
            return Markdown(**kwds)
        if len(args) > 0:
            self._render(args[0], **kwds)

    def _render(self, s, hide=None):
        if hide is None:
            hide = self._hide
        html(md2html(s),hide=hide)

# not used
#md = Markdown()

# Instead... of the above server-side markdown, we use this client-side markdown.

class Marked(object):
    r"""
    Cell mode that renders everything after %md as Github flavored
    markdown [1] with mathjax and hides the input by default.

    [1] https://help.github.com/articles/github-flavored-markdown

    The rendering is done client-side using marked and mathjax.

    EXAMPLES::

        ---
        %md
        # A Title

        ## A subheading

        ---
        %md(hide=False)
        # A title

        - a list

        ---
        md("# A title", hide=False)


        ---
        %md(hide=False) `some code`

    """
    def __init__(self, hide=False):
        self._hide = hide

    def __call__(self, *args, **kwds):
        if len(kwds) > 0 and len(args) == 0:
            return Marked(**kwds)
        if len(args) > 0:
            self._render(args[0], **kwds)

    def _render(self, s, hide=None):
        if hide is None:
            hide = self._hide
        if hide:
            salvus.hide('input')
        salvus.md(s)

md = Marked()

#####
## Raw Input
# - this is the Python 2.x interpretation.  In Python 3.x there is no raw_input,
# and raw_input is renamed input (to cause more confusion).
#####
def raw_input(prompt='', default='', placeholder='', input_width=None, label_width=None, type=None):
    """
    Read a string from the user in the worksheet interface to Sage.

    INPUTS:

    - prompt -- (default: '') a label to the left of the input
    - default -- (default: '') default value to put in input box
    - placeholder -- (default: '') default placeholder to put in grey when input box empty
    - input_width -- (default: None) css that gives the width of the input box
    - label_width -- (default: None) css that gives the width of the label
    - type -- (default: None) if not given, returns a unicode string representing the exact user input.
      Other options include:
          - type='sage' -- will evaluate it to a sage expression in the global scope.
          - type=anything that can be called, e.g., type=int, type=float.

    OUTPUT:

    - By default, returns a **unicode** string (not a normal Python str). However, can be customized
      by changing the type.

    EXAMPLE::

         print(raw_input("What is your full name?", default="Sage Math", input_width="20ex", label_width="25ex"))

    """
    return salvus.raw_input(prompt=prompt, default=default, placeholder=placeholder, input_width=input_width, label_width=label_width, type=type)

def input(*args, **kwds):
    """
    Read a string from the user in the worksheet interface to Sage and return evaluated object.

    Type raw_input? for more help; this function is the same as raw_input, except with type='sage'.

    EXAMPLE::

         print(type(input("What is your age", default=18, input_width="20ex", label_width="25ex")))

    """
    kwds['type'] = 'sage'
    return raw_input(*args, **kwds)

#####
## Clear
def clear():
    """
    Clear the output of the current cell.  You can use this to
    dynamically animate the output of a cell using a for loop.

    SEE ALSO: delete_last_output
    """
    salvus.clear()

def delete_last_output():
    """
    Delete the last output message.

    SEE ALSO: clear
    """
    salvus.delete_last_output()

#####
# Generic Pandoc cell decorator

def pandoc(fmt, doc=None, hide=True):
    """
    INPUT:

    - fmt -- one of 'docbook', 'haddock', 'html', 'json', 'latex', 'markdown', 'markdown_github',
                 'markdown_mmd', 'markdown_phpextra', 'markdown_strict', 'mediawiki',
                 'native', 'opml', 'rst', 'textile'

    - doc -- a string in the given format

    OUTPUT:

    - Called directly, you get the HTML rendered version of doc as a string.

    - If you use this as a cell decorator, it displays the HTML output, e.g.,

        %pandoc('mediawiki')
        * ''Unordered lists'' are easy to do:
        ** Start every line with a star.
        *** More stars indicate a deeper level.

    """
    if doc is None:
        return lambda x : html(pandoc(fmt, x), hide=hide) if x is not None else ''
    import subprocess
    p = subprocess.Popen(['pandoc', '-f', fmt,  '--mathjax'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE)
    if not isinstance(doc, unicode):
        doc = unicode(doc, 'utf8')
    p.stdin.write(doc.encode('UTF-8'))
    p.stdin.close()
    err = p.stderr.read()
    if err:
        raise RuntimeError(err)
    return p.stdout.read()


def wiki(doc=None, hide=True):
    """
    Mediawiki markup cell decorator.   E.g.,

    EXAMPLE::

        %wiki(hide=False)
        * ''Unordered lists'' and math like $x^3 - y^2$ are both easy
        ** Start every line with a star.
        *** More stars indicate a deeper level.    """
    if doc is None:
        return lambda doc: wiki(doc=doc, hide=hide) if doc else ''
    html(pandoc('mediawiki', doc=doc), hide=hide)


mediawiki = wiki

######

def load_html_resource(filename):
    fl = filename.lower()
    if fl.startswith('http://') or fl.startswith('https://'):
        # remote url
        url = fl
    else:
        # local file
        url = salvus.file(filename, show=False)
    ext = os.path.splitext(filename)[1][1:].lower()
    if ext == "css":
        salvus.javascript('''$.get("%s", function(css) { $('<style type=text/css></style>').html(css).appendTo("body")});'''%url)
    elif ext == "html":
        salvus.javascript('element.append($("<div>").load("%s"))'%url)
    elif ext == "coffee":
        salvus.coffeescript('$.ajax({url:"%s"}).done (data) ->\n  eval(CoffeeScript.compile(data))'%url)
    elif ext == "js":
        salvus.html('<script src="%s"></script>'%url)

def attach(*args):
    r"""
    Load file(s) into the Sage worksheet process and add to list of attached files.
    All attached files that have changed since they were last loaded are reloaded
    the next time a worksheet cell is executed.

    INPUT:

    - ``files`` - list of strings, filenames to attach

    .. SEEALSO::

        :meth:`sage.repl.attach.attach` docstring has details on how attached files
        are handled
    """
    # can't (yet) pass "attach = True" to load(), so do this

    if len(args) == 1:
        if isinstance(args[0], (unicode,str)):
            args = tuple(args[0].replace(',',' ').split())
        if isinstance(args[0], (list, tuple)):
            args = args[0]
    try:
        from sage.repl.attach import load_attach_path
    except ImportError:
        raise NotImplementedError("sage_salvus: attach not available")

    for fname in args:
        for path in load_attach_path():
            fpath = os.path.join(path, fname)
            fpath = os.path.expanduser(fpath)
            if os.path.isfile(fpath):
                load(fname)
                sage.repl.attach.add_attached_file(fpath)
                break
        else:
            raise IOError('did not find file %r to attach' % fname)


# Monkey-patched the load command
def load(*args, **kwds):
    """
    Load Sage object from the file with name filename, which will have
    an .sobj extension added if it doesn't have one.  Or, if the input
    is a filename ending in .py, .pyx, or .sage, load that file into
    the current running session.  Loaded files are not loaded into
    their own namespace, i.e., this is much more like Python's
    "execfile" than Python's "import".

    You may also load an sobj or execute a code file available on the web
    by specifying the full URL to the file.  (Set ``verbose = False`` to
    supress the download progress indicator.)

    INPUT:

        - args -- any number of filename strings with any of the following extensions:

             .sobj, .sage, .py, .pyx, .html, .css, .js, .coffee, .pdf

        - ``verbose`` -- (default: True) load file over the network.

    If you load any of the web types (.html, .css, .js, .coffee), they are loaded
    into the web browser DOM (or Javascript session), not the Python process.

    If you load a pdf, it is displayed in the output of the worksheet.  The extra
    options are passed to smc.pdf -- see the docstring for that.

    In SageMathCloud you may also use load as a decorator, with exactly one filename as input::

        %load foo.sage

    This loads a single file whose name has a space in it::

        %load a b.sage

    The following are all valid ways to use load::

        %load a.html
        %load a.css
        %load a.js
        %load a.coffee
        %load a.css
        load('a.css', 'a.js', 'a.coffee', 'a.html')
        load(['a.css', 'a.js', 'a.coffee', 'a.html'])

    ALIAS: %runfile is the same as %load, for compatibility with IPython.
    """
    if len(args) == 1:
        if isinstance(args[0], (unicode, str)):
            args = (args[0].strip(), )
        if isinstance(args[0], (list, tuple)):
            args = args[0]

    if len(args) == 0 and len(kwds) == 1:
        # This supports
        #   %load(verbose=False)  a.sage
        # which doesn't really matter right now, since there is a bug in Sage's own
        # load command, where it isn't verbose for network code, but is for objects.
        def f(*args):
            return load(*args, **kwds)
        return f

    t = '__tmp__'; i=0
    while t+str(i) in salvus.namespace:
        i += 1
    t += str(i)

    # First handle HTML related args -- these are all very oriented toward cloud.sagemath worksheets
    html_extensions = set(['js','css','coffee','html'])
    other_args = []
    for arg in args:
        i = arg.rfind('.')
        if i != -1 and arg[i+1:].lower() in html_extensions:
            load_html_resource(arg)
        elif i != -1 and arg[i+1:].lower() == 'pdf':
            show_pdf(arg, **kwds)
        else:
            other_args.append(arg)

    # pdf?
    for arg in args:
        i = arg.find('.')

    # now handle remaining non-web arguments.
    if len(other_args) > 0:
        try:
            exec 'salvus.namespace["%s"] = sage.structure.sage_object.load(*__args, **__kwds)'%t in salvus.namespace, {'__args':other_args, '__kwds':kwds}
            return salvus.namespace[t]
        finally:
            try:
                del salvus.namespace[t]
            except: pass

# add alias, due to IPython.
runfile = load

## Make it so pylab (matplotlib) figures display, at least using pylab.show
import pylab
def _show_pylab(svg=True):
    """
    Show a Pylab plot in a Sage Worksheet.

    INPUTS:

       - svg -- boolean (default: True); if True use an svg; otherwise, use a png.
    """
    try:
        ext = '.svg' if svg else '.png'
        filename = uuid() + ext
        pylab.savefig(filename)
        salvus.file(filename)
    finally:
        try:
            os.unlink(filename)
        except:
            pass

pylab.show = _show_pylab
matplotlib.figure.Figure.show = show

import matplotlib.pyplot
def _show_pyplot(svg=True):
    """
    Show a Pylab plot in a Sage Worksheet.

    INPUTS:

       - svg -- boolean (default: True); if True use an svg; otherwise, use a png.
    """
    try:
        ext = '.svg' if svg else '.png'
        filename = uuid() + ext
        matplotlib.pyplot.savefig(filename)
        salvus.file(filename)
    finally:
        try:
            os.unlink(filename)
        except:
            pass
matplotlib.pyplot.show = _show_pyplot


## Our own displayhook

_system_sys_displayhook = sys.displayhook

def displayhook(obj):
    if isinstance(obj, (Graphics3d, Graphics, GraphicsArray, matplotlib.figure.Figure, matplotlib.axes.Axes, matplotlib.image.AxesImage, Animation)):
        show(obj)
    else:
        _system_sys_displayhook(obj)

sys.displayhook = displayhook
import sage.misc.latex, types
# We make this a list so that users can append to it easily.
TYPESET_MODE_EXCLUDES = [sage.misc.latex.LatexExpr, types.NoneType,
                         type, sage.plot.plot3d.base.Graphics3d,
                         sage.plot.graphics.Graphics,
                         sage.plot.graphics.GraphicsArray]

def typeset_mode(on=True, display=True, **args):
    """
    Turn typeset mode on or off.  When on, each output is typeset using LaTeX.

    EXAMPLES::

         typeset_mode()  # turns typesetting on

         typeset_mode(False)  # turn typesetting off

         typeset_mode(True, display=False) # typesetting mode on, but do not make output big and centered

    """
    if isinstance(on, (str, unicode)):  # e.g.,   %typeset_mode False
        on = sage_eval(on, {'false':False, 'true':True})
    if on:
        def f(obj):
            if isinstance(obj, tuple(TYPESET_MODE_EXCLUDES)):
                displayhook(obj)
            else:
                show(obj, display=display)
        sys.displayhook = f
    else:
        sys.displayhook = displayhook

def default_mode(mode):
    """
    Set the default mode for cell evaluation.  This is equivalent
    to putting %mode at the top of any cell that does not start
    with %.  Use default_mode() to return the current mode.
    Use default_mode("") to have no default mode.

    EXAMPLES::

    Make Pari/GP the default mode:

        default_mode("gp")
        default_mode()   # outputs "gp"

    Then switch back to Sage::

        default_mode("")   # or default_mode("sage")

    You can also use default_mode as a line decorator::

        %default_mode gp   # equivalent to default_mode("gp")
    """
    return salvus.default_mode(mode)






#######################################################
# Monkey patching and deprecation --
#######################################################

# Monkey patch around a bug in Python's findsource that breaks deprecation in cloud worksheets.
# This won't matter if we switch to not using exec, since then there will be a file behind
# each block of code.  However, for now we have to do this.
import inspect
_findsource = inspect.findsource
def findsource(object):
    try: return _findsource(object)
    except: raise IOError('source code not available')  # as *claimed* by the Python docs!
inspect.findsource = findsource



#######################################################
# Viewing pdf's
#######################################################

def show_pdf(filename, viewer="object", width=1000, height=600, scale=1.6):
    """
    Display a PDF file from the filesystem in an output cell of a worksheet.

    It uses the HTML object tag, which uses either the browser plugin,
    or provides a download link in case the browser can't display pdf's.

    INPUT:

    - filename
    - width     -- (default: 1000) -- pixel width of viewer
    - height    -- (default: 600)  -- pixel height of viewer
    """
    url = salvus.file(filename, show=False)
    s = '''<object data="%s" type="application/pdf" width="%s" height="%s">
    <p>Your browser doesn't support embedded PDF's, but you can <a href="%s">download %s</a></p>
    </object>'''%(url, width, height, url, filename)
    salvus.html(s)


########################################################
# WebRTC Support
########################################################
def sage_chat(chatroom=None, height="258px"):
    if chatroom is None:
        from random import randint
        chatroom = randint(0,1e24)
    html("""
    <iframe src="/static/webrtc/group_chat_cell.html?%s" height="%s" width="100%%"></iframe>
    """%(chatroom, height), hide=False)


########################################################
# Documentation of modes
########################################################
def modes():
    """
    To use a mode command, either type

        %command <a line of code>

    or

        %command
        [rest of cell]

    Create your own mode command by defining a function that takes
    a string as input and outputs a string. (Yes, it is that simple.)
    """
    import re
    mode_cmds = set()
    for s in open(os.path.realpath(__file__), 'r').xreadlines():
        s = s.strip()
        if s.startswith('%'):
            mode_cmds.add(re.findall(r'%[a-zA-Z]+', s)[0])
    mode_cmds.discard('%s')
    for k,v in sage.interfaces.all.__dict__.iteritems():
        if isinstance(v, sage.interfaces.expect.Expect):
            mode_cmds.add('%'+k)
    mode_cmds.update(['%cython', '%time', '%auto', '%hide', '%hideall',
                       '%fork', '%runfile', '%default_mode', '%typeset_mode'])
    v = list(sorted(mode_cmds))
    return v

########################################################
# Go mode
########################################################
def go(s):
    """
    Run a go program.  For example,

        %go
        func main() { fmt.Println("Hello World") }

    You can set the whole worksheet to be in go mode by typing

        %default_mode go

    NOTES:

    - The official Go tutorial as a long Sage Worksheet is available here:

        https://github.com/sagemath/cloud-examples/tree/master/go

    - There is no relation between one cell and the next.  Each is a separate
      self-contained go program, which gets compiled and run, with the only
      side effects being changes to the filesystem.  The program itself is
      stored in a random file that is deleted after it is run.

    - The %go command automatically adds 'package main' and 'import "fmt"'
      (if fmt. is used) to the top of the program, since the assumption
      is that you're using %go interactively.
    """
    import uuid
    name = str(uuid.uuid4())
    if 'fmt.' in s and '"fmt"' not in s and "'fmt'" not in s:
        s = 'import "fmt"\n' + s
    if 'package main' not in s:
        s = 'package main\n' + s
    try:
        open(name +'.go','w').write(s.encode("UTF-8"))
        (child_stdin, child_stdout, child_stderr) = os.popen3('go build %s.go'%name)
        err = child_stderr.read()
        sys.stdout.write(child_stdout.read())
        sys.stderr.write(err)
        sys.stdout.flush()
        sys.stderr.flush()
        if not os.path.exists(name): # failed to produce executable
            return
        (child_stdin, child_stdout, child_stderr) = os.popen3("./" + name)
        sys.stdout.write(child_stdout.read())
        sys.stderr.write(child_stderr.read())
        sys.stdout.flush()
        sys.stderr.flush()
    finally:
        try:
            os.unlink(name+'.go')
        except:
            pass
        try:
            os.unlink(name)
        except:
            pass

########################################################
# Java mode
########################################################
def java(s):
    """
    Run a Java program.  For example,

        %java
        public class YourName { public static void main(String[] args) { System.out.println("Hello world"); } }

    You can set the whole worksheet to be in java mode by typing

        %default_mode java

    NOTE:

    - There is no relation between one cell and the next.  Each is a separate
      self-contained java program, which gets compiled and run, with the only
      side effects being changes to the filesystem.  The program itself is
      stored in a file named as the public class that is deleted after it is run.
    """
    name = re.search('public class (?P<name>[a-zA-Z0-9]+)', s)
    if name:
        name = name.group('name')
    else:
        print 'error public class name not found'
        return
    try:
        open(name +'.java','w').write(s.encode("UTF-8"))
        (child_stdin, child_stdout, child_stderr) = os.popen3('javac %s.java'%name)
        err = child_stderr.read()
        sys.stdout.write(child_stdout.read())
        sys.stderr.write(err)
        sys.stdout.flush()
        sys.stderr.flush()
        if not os.path.exists(name+'.class'): # failed to produce executable
            return
        (child_stdin, child_stdout, child_stderr) = os.popen3('java %s'%name)
        sys.stdout.write(child_stdout.read())
        sys.stderr.write('\n'+child_stderr.read())
        sys.stdout.flush()
        sys.stderr.flush()
    finally:
        pass
        try:
            os.unlink(name+'.java')
        except:
            pass
        try:
            os.unlink(name+'.class')
        except:
            pass

# Julia pexepect interface support
import julia
import sage.interfaces
sage.interfaces.julia = julia # the module
julia = julia.julia # specific instance
sage.interfaces.all.julia = julia




# Help command
import sage.misc.sagedoc
import sage.version
import sage.misc.sagedoc
def help(*args, **kwds):
    if len(args) > 0 or len(kwds) > 0:
        sage.misc.sagedoc.help(*args, **kwds)
    else:
        s = """
## Welcome to Sage %s!

- **Online documentation:** [View the Sage documentation online](http://www.sagemath.org/doc/).

- **Help:** For help on any object or function, for example `matrix_plot`, enter `matrix_plot?` followed by tab or shift+enter.  For help on any module (or object or function), for example, `sage.matrix`, enter `help(sage.matrix)`.

- **Tab completion:** Type `obj` followed by tab to see all completions of obj.  To see all methods you may call on `obj`, type `obj.` followed by tab.

- **Source code:** Enter `matrix_plot??` followed by tab or shift+enter to look at the source code of `matrix_plot`.

- **License information:** For license information about Sage and its components, enter `license()`."""%sage.version.version
        salvus.md(s)

# Import the jupyter kernel client.
from sage_jupyter import jupyter

# license() workaround for IPython pager
# could also set os.environ['TERM'] to 'dumb' to workaround the pager
def license():
    r"""
    Display Sage license file COPYING.txt

    You can also view this information in an SMC terminal session:

        | $ sage
        | sage: license()

    """
    print(sage.misc.copying.license)

# search_src
import os
import glob

# from http://stackoverflow.com/questions/9877462/is-there-a-python-equivalent-to-the-which-commane
# in python 3.3+ there is shutil.which()
def which(pgm):
    path=os.getenv('PATH')
    for p in path.split(os.path.pathsep):
        p=os.path.join(p,pgm)
        if os.path.exists(p) and os.access(p,os.X_OK):
            return p

from sage_server import MAX_CODE_SIZE
def search_src(str, max_chars = MAX_CODE_SIZE):
    r"""
    Get file names resulting from git grep of smc repo

    INPUT:

    - ``str`` -- string, expression to search for; will be quoted
    - ``max_chars`` -- integer, max characters to display from selected file

    OUTPUT:

    Interact selector of matching filenames. Choosing one causes its
    contents to be shown in salvus.code() output.
    """
    sage_cmd = which("sage")
    if os.path.islink(sage_cmd):
        sage_cmd = os.readlink(sage_cmd)

    # /projects/sage/sage-x.y/src/bin
    sdir = os.path.dirname(sage_cmd)

    # /projects/sage/sage-x.y
    sdir = os.path.dirname(os.path.dirname(sdir))

    # /projects/sage/sage-x.y/src
    sdir = glob.glob(sdir + "/src/sage")[0]

    cmd = 'cd %s;timeout 5 git grep -il "%s"'%(sdir, str)
    srch = os.popen(cmd).read().splitlines()
    header = "files matched"
    nftext = header + ": %s"%len(srch)

    @interact
    def _(fname = selector([nftext]+srch,"view source file:")):
        if not fname.startswith(header):
            with open(os.path.join(sdir, fname), 'r') as infile:
                code = infile.read(max_chars)
            salvus.code(code, mode = "python", filename = fname)

# search_doc
def search_doc(str):
    r"""
    Create link to Google search of sage docs.

    INPUT:

    - ``str`` -- string, expression to search for; will be quoted

    OUTPUT:

    HTML hyperlink to google search
    """
    txt = 'Use this link to search: ' + \
    '<a href="https://www.google.com/search?q=site%3Adoc.sagemath.org+' + \
    str + '&oq=site%3Adoc.sagemath.org">'+str+'</a>'
    salvus.html(txt)

import sage.misc.session
def show_identifiers():
    """
    Returns a list of all variable names that have been defined during this session.

    SMC introduces worksheet variables, including 'smc','salvus', 'require', and after reset(), 'sage_salvus'.
    These identifiers are removed from the output of sage.misc.session.show_identifiers() on return.
    User should not assign to these variables when running code in a worksheet.
    """
    si =  eval('show_identifiers.fn()',salvus.namespace)
    si2 = [v for v in si if v not in ['smc','salvus','require','sage_salvus']]
    return si2

show_identifiers.fn = sage.misc.session.show_identifiers
