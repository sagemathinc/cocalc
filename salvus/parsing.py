"""
parser.py

Code for parsing Sage code blocks sensibly.
"""

import string
import traceback

def get_input(prompt):
    try:
        r = raw_input(prompt)
        z = r
        if z.rstrip().endswith(':'):
            while True:
                try:
                    z = raw_input('...       ')
                except EOFError:
                    quit = True
                    break
                if z != '':
                    r += '\n    ' + z
                else:
                    break
        return r
    except EOFError:
        return None

def preparse_code(code):
    if code.lstrip().startswith('!'):
        # shell escape (TODO: way better)
        code = 'print os.popen(eval("%r")).read()'%code[1:]
    else:
        import sage.all_cmdline
        code = sage.all_cmdline.preparse(code)
    return code

def strip_string_literals(code, state=None):
    new_code = []
    literals = {}
    counter = 0
    start = q = 0
    if state is None:
        in_quote = False
        raw = False
    else:
        in_quote, raw = state
    while True:
        sig_q = code.find("'", q)
        dbl_q = code.find('"', q)
        hash_q = code.find('#', q)
        q = min(sig_q, dbl_q)
        if q == -1: q = max(sig_q, dbl_q)
        if not in_quote and hash_q != -1 and (q == -1 or hash_q < q):
            # it's a comment
            newline = code.find('\n', hash_q)
            if newline == -1: newline = len(code)
            counter += 1
            label = "L%s" % counter
            literals[label] = code[hash_q:newline]   # changed from sage
            new_code.append(code[start:hash_q].replace('%','%%'))
            new_code.append("%%(%s)s" % label)
            start = q = newline
        elif q == -1:
            if in_quote:
                counter += 1
                label = "L%s" % counter
                literals[label] = code[start:]
                new_code.append("%%(%s)s" % label)
            else:
                new_code.append(code[start:].replace('%','%%'))
            break
        elif in_quote:
            if code[q-1] == '\\':
                k = 2
                while code[q-k] == '\\':
                    k += 1
                if k % 2 == 0:
                    q += 1
            if code[q:q+len(in_quote)] == in_quote:
                counter += 1
                label = "L%s" % counter
                literals[label] = code[start:q+len(in_quote)]
                new_code.append("%%(%s)s" % label)
                q += len(in_quote)
                start = q
                in_quote = False
            else:
                q += 1
        else:
            raw = q>0 and code[q-1] in 'rR'
            if len(code) >= q+3 and (code[q+1] == code[q] == code[q+2]):
                in_quote = code[q]*3
            else:
                in_quote = code[q]
            new_code.append(code[start:q].replace('%', '%%'))
            start = q
            q += len(in_quote)

    return "".join(new_code), literals, (in_quote, raw)

def end_of_expr(s):
    """
    The input string s is a code expression that contains no strings (they have been stripped).
    Find the end of the expression that starts at the beginning of s by finding the first whitespace
    at which the parenthesis and brackets are matched.

    The returned index is the position *after* the expression.
    """
    i = 0
    parens = 0
    brackets = 0
    while i<len(s):
        c = s[i]
        if c == '(':
            parens += 1
        elif c == '[':
            brackets += 1
        elif c == ')':
            parens -= 1
        elif c == ']':
            brackets -= 1
        elif parens == 0 and brackets == 0 and (c == ' ' or c == '\t'):
            return i
        i += 1
    return i

dec_counter = 0
def divide_into_blocks(code):
    global dec_counter
    code, literals, state = strip_string_literals(code)
    code = [x for x in code.splitlines() if x.strip()]  # remove blank lines

    # Compute the line-level code decorators.
    c = list(code)
    try:
        v = []
        decs = {}
        for line in code:
            done = False
            # NOTE: strip_string_literals maps % to %%, because %foo is used for python string templating.
            if line.lstrip().startswith('%%'):
                i = line.find("%")
                j = end_of_expr(line[i+2:]) + i+2
                expr = line[j:]%literals
                # Special case -- if % starts line *and* expr is empty (or a comment),
                # then code decorators impacts the rest of the code.
                sexpr = expr.strip()
                if i == 0 and (len(sexpr) == 0 or sexpr.startswith('#')):
                    new_line = '%ssalvus.execute_with_code_decorators(*salvus._decs[%s])'%(line[:i], dec_counter)
                    expr = ('\n'.join(code[len(v)+1:]))%literals
                    done = True
                else:
                    # Expr is nonempty -- code decorator only impacts this line
                    new_line = '%ssalvus.execute_with_code_decorators(*salvus._decs[%s])'%(line[:i], dec_counter)

                decs[dec_counter] = ([line[i+2:j]%literals], expr)
                dec_counter += 1
            else:
                new_line = line
            v.append(new_line)
            if done:
                break
        code = v
    except Exception, mesg:
        code = c

    # Compute the blocks
    i = len(code)-1
    blocks = []
    while i >= 0:
        stop = i
        while i>=0 and len(code[i]) > 0 and code[i][0] in string.whitespace:
            i -= 1
        # remove comments
        for k, v in literals.iteritems():
            if v.startswith('#'):
                literals[k] = ''
        block = ('\n'.join(code[i:]))%literals
        bs = block.strip()
        if bs: # has to not be only whitespace
            blocks.insert(0, [i, stop, bs])
        code = code[:i]
        i = len(code)-1

    # merge try/except/finally/decorator blocks
    i = 1
    while i < len(blocks):
        s = blocks[i][-1].lstrip()
        if s.startswith('finally:') or s.startswith('except'):
            if blocks[i-1][-1].lstrip().startswith('try:'):
                blocks[i-1][-1] += '\n' + blocks[i][-1]
                blocks[i-1][1] = blocks[i][1]
                del blocks[i]
        elif s.startswith('def') and blocks[i-1][-1].lstrip().startswith('@'):
            blocks[i-1][-1] += '\n' + blocks[i][-1]
            blocks[i-1][1] = blocks[i][1]
            del blocks[i]
        else:
            i += 1

    return blocks, decs




############################################

CHARS0 = string.ascii_letters + string.digits + '_'
CHARS  = CHARS0 + '.'
def guess_last_expression(obj):  # TODO: bad guess -- need to use a parser to go any further.
    i = len(obj)-1
    while i >= 0 and obj[i] in CHARS:
        i -= 1
    return obj[i+1:]

def is_valid_identifier(target):
    if len(target) == 0: return False
    for x in target:
        if x not in CHARS0:
            return False
    if target[0] not in string.ascii_letters + '_':
        return False
    return True



# Keywords from http://docs.python.org/release/2.7.2/reference/lexical_analysis.html
_builtin_completions = __builtins__.keys() + ['and', 'del', 'from', 'not', 'while', 'as', 'elif', 'global', 'or', 'with', 'assert', 'else', 'if', 'pass', 'yield', 'break', 'except', 'import', 'print', 'class', 'exec', 'in', 'raise', 'continue', 'finally', 'is', 'return', 'def', 'for', 'lambda', 'try']

def introspect(code, namespace, preparse=True):
    """
    INPUT:

    - code -- a string containing Sage (if preparse=True) or Python code.

    - namespace -- a dictionary to complete in (we also complete using
      builtins such as 'def', 'for', etc.

    - preparse -- a boolean

    OUTPUT:

    An object: {'result':, 'target':, 'expr':, 'status':, 'get_help':, 'get_completions':, 'get_source':}
    """
    # result: the docstring, source code, or list of completions (at
    # return, it might thus be either a list or a string)
    result = []

    # expr: the part of code that is used to do the completion, e.g.,
    # for 'a = n.m.foo', expr would be 'n.m.foo'.  It can be more complicated,
    # e.g., for '(2+3).foo.bar' it would be '(2+3).foo'.
    expr   = ''

    # target: for completions, target is the part of the code that we
    # complete on in the namespace defined by the object right before
    # it, e.g., for n.m.foo, the target is "foo".  target is the empty
    # string for source code and docstrings.
    target = ''

    # When returning, exactly one of the following will be true:
    get_help        = False      # getting docstring of something
    get_source      = False      # getting source code of a function
    get_completions = True       # getting completions of an identifier in some namespace

    try:
        # Strip all strings from the code, replacing them by template
        # symbols; this makes parsing much easier.
        code0, literals, state = strip_string_literals(code.strip())  # we strip, since trailing space could cause confusion below

        # Move i so that it points to the start of the last expression in the code.
        # (TODO: this should probably be replaced by using ast on preparsed version.  Not easy.)
        i = max([code0.rfind(t) for t in '\n;='])+1
        while i<len(code0) and code0[i] in string.whitespace:
            i += 1

        # Break the line in two pieces: before_expr | expr; we may
        # need before_expr in order to evaluate and make sense of
        # expr.  We also put the string literals back in, so that
        # evaluation works.
        expr        = code0[i:]%literals
        before_expr = code0[:i]%literals

        if '.' not in expr and '(' not in expr and ')' not in expr and '?' not in expr:
            # Easy case: this is just completion on a simple identifier in the namespace.
            get_help = False; get_completions = True; get_source = False
            target = expr
        else:
            # Now for all of the other harder cases.
            i = max([expr.rfind(s) for s in '?('])
            if i >= 1 and i == len(expr)-1 and expr[i-1] == '?':  # expr ends in two ?? -- source code
                get_source = True; get_completions = False; get_help = False
                target = ""
                obj    = expr[:i-1]
            elif i == len(expr)-1:    # ends in ( or ? (but not ??) -- docstring
                get_help = True; get_completions = False; get_source = False
                target = ""
                obj    = expr[:i]
            else:  # completions (not docstrings or source)
                get_help = False; get_completions = True; get_source = False
                i      = expr.rfind('.')
                target = expr[i+1:]
                if target == '' or is_valid_identifier(target):
                    obj    = expr[:i]
                else:
                    expr = guess_last_expression(target)
                    i = expr.rfind('.')
                    if i != -1:
                        target = expr[i+1:]
                        obj    = expr[:i]
                    else:
                        target = expr

        if get_completions and target == expr:
            j      = len(expr)
            v      = [x[j:] for x in (namespace.keys() + _builtin_completions) if x.startswith(expr)]
        else:

            # We will try to evaluate
            # obj.  This is danerous and a priori could take
            # forever, so we spend at most 1 second doing this --
            # if it takes longer a signal kills the evaluation.
            # Obviously, this could in fact lock if
            # non-interruptable code is called, which should be rare.

            O = None
            try:
                import signal
                def mysig(*args): raise KeyboardInterrupt
                signal.signal(signal.SIGALRM, mysig)
                signal.alarm(1)
                import sage.all_cmdline
                if before_expr.strip():
                    try:
                        exec (before_expr if not preparse else preparse_code(before_expr)) in namespace
                    except Exception, msg:
                        pass
                        # uncomment for debugging only
                        # traceback.print_exc()
                # We first try to evaluate the part of the expression before the name
                try:
                    O = eval(obj if not preparse else preparse_code(obj), namespace)
                except SyntaxError:
                    # If that fails, we try on a subexpression.
                    # TODO: This will not be needed when
                    # this code is re-written to parse using an
                    # AST, instead of using this lame hack.
                    obj = guess_last_expression(obj)
                    O = eval(obj if not preparse else preparse_code(obj), namespace)
            finally:
                signal.signal(signal.SIGALRM, signal.SIG_IGN)

            if get_help:
                import sage.misc.sageinspect
                result = eval('getdoc(O)', {'getdoc':sage.misc.sageinspect.sage_getdoc, 'O':O})
            elif get_source:
                import sage.misc.sageinspect
                result = eval('getsource(O)', {'getsource':sage.misc.sageinspect.sage_getsource, 'O':O})
            elif get_completions:
                if O is not None:
                    v = dir(O)
                    if hasattr(O, 'trait_names'):
                        v += O.trait_names()
                    if not target.startswith('_'):
                        v = [x for x in v if x and not x.startswith('_')]
                    j = len(target)
                    v = [x[j:] for x in v if x.startswith(target)]
                else:
                    v = []

        if get_completions:
            result = list(sorted(set(v), lambda x,y:cmp(x.lower(),y.lower())))

    except Exception, msg:
        traceback.print_exc()
        result = []
        status = 'ok'
    else:
        status = 'ok'
    return {'result':result, 'target':target, 'expr':expr, 'status':status, 'get_help':get_help, 'get_completions':get_completions, 'get_source':get_source}
