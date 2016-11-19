"""
sage_parser.py

Code for parsing Sage code blocks sensibly.
"""

#########################################################################################
#       Copyright (C) 2016, Sagemath Inc.
#                                                                                       #
#  Distributed under the terms of the GNU General Public License (GPL), version 2+      #
#                                                                                       #
#                  http://www.gnu.org/licenses/                                         #
#########################################################################################

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

#def strip_leading_prompts(code, prompts=['sage:', '....:', '...:', '>>>', '...']):
#    code, literals, state = strip_string_literals(code)
#    code2 = []
#    for line in code.splitlines():
#        line2 = line.lstrip()
#        for p in prompts:
#            if line2.startswith(p):
#                line2 = line2[len(p):]
#                if p[0] != '.':
#                    line2 = line2.lstrip()
#                break
#        code2.append(line2)
#    code = ('\n'.join(code2))%literals
#    return code

def preparse_code(code):
    import sage.all_cmdline
    return sage.all_cmdline.preparse(code, ignore_prompts=True)

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
            literals[label] = code[hash_q:newline]
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

# NOTE/TODO: The dec_args dict will leak memory over time.  However, it only
# contains code that was entered, so it should never get big.  It
# seems impossible to know for sure whether a bit of code will be
# eventually needed later, so this leakiness seems necessary.
dec_counter = 0
dec_args = {}

# Divide the input code (a string) into blocks of code.
def divide_into_blocks(code):
    global dec_counter

    # strip string literals from the input, so that we can parse it without having to worry about strings
    code, literals, state = strip_string_literals(code)

    # divide the code up into line lines.
    code = code.splitlines()

    # Compute the line-level code decorators.
    c = list(code)
    try:
        v = []
        for line in code:
            done = False

            # Transform shell escape into sh decorator.
            if line.lstrip().startswith('!'):
                line = line.replace('!', "%%sh ", 1)

            # Check for cell decorator
            # NOTE: strip_string_literals maps % to %%, because %foo is used for python string templating.
            if line.lstrip().startswith('%%'):
                i = line.find("%")
                j = end_of_expr(line[i+2:]) + i+2  + 1 # +1 for the space or tab delimiter
                expr = line[j:]%literals
                # Special case -- if % starts line *and* expr is empty (or a comment),
                # then code decorators impacts the rest of the code.
                sexpr = expr.strip()
                if i == 0 and (len(sexpr) == 0 or sexpr.startswith('#')):
                    new_line = '%ssalvus.execute_with_code_decorators(*_salvus_parsing.dec_args[%s])'%(line[:i], dec_counter)
                    expr = ('\n'.join(code[len(v)+1:]))%literals
                    done = True
                else:
                    # Expr is nonempty -- code decorator only impacts this line
                    new_line = '%ssalvus.execute_with_code_decorators(*_salvus_parsing.dec_args[%s])'%(line[:i], dec_counter)

                dec_args[dec_counter] = ([line[i+2:j]%literals], expr)
                dec_counter += 1
            else:
                new_line = line
            v.append(new_line)
            if done:
                break
        code = v
    except Exception, mesg:
        code = c

    ## Tested this: Completely disable block parsing:
    ## but it requires the caller to do "exec compile(block+'\n', '', 'exec') in namespace, locals", which means no display hook,
    ## so "2+2" breaks.
    ## return [[0,len(code)-1,('\n'.join(code))%literals]]

    # Remove comment lines -- otherwise could get empty blocks that can't be exec'd.
    # For example, exec compile('#', '', 'single') is a syntax error.
    # Also, comments will confuse the code to break into blocks before.
    comment_lines = {}
    for label, v in literals.iteritems():
        if v.startswith('#'):
            comment_lines[u"%%(%s)s" % label] = True
    code = [x for x in code if not comment_lines.get(x.strip(), False)]

    # take only non-whitespace lines now for Python code (string literals have already been removed).
    code = [x for x in code if x.strip()]

    # Compute the blocks
    i = len(code)-1
    blocks = []
    while i >= 0:
        stop = i
        paren_depth = code[i].count('(') - code[i].count(')')
        brack_depth = code[i].count('[') - code[i].count(']')
        curly_depth = code[i].count('{') - code[i].count('}')
        while i>=0 and ((len(code[i]) > 0 and (code[i][0] in string.whitespace)) or paren_depth < 0 or brack_depth < 0 or curly_depth < 0):
            i -= 1
            if i >= 0:
                paren_depth += code[i].count('(') - code[i].count(')')
                brack_depth += code[i].count('[') - code[i].count(']')
                curly_depth += code[i].count('{') - code[i].count('}')
        block = ('\n'.join(code[i:]))%literals
        bs = block.strip()
        if bs: # has to not be only whitespace
            blocks.insert(0, [i, stop, bs])
        code = code[:i]
        i = len(code)-1

    # merge try/except/finally/decorator/else/elif blocks
    i = 1
    def merge():
        "Merge block i-1 with block i."
        blocks[i-1][-1] += '\n' + blocks[i][-1]
        blocks[i-1][1] = blocks[i][1]
        del blocks[i]

    while i < len(blocks):
        s = blocks[i][-1].lstrip()

        # finally/except lines after a try
        if (s.startswith('finally') or s.startswith('except')) and blocks[i-1][-1].lstrip().startswith('try'):
            merge()

        # function definitions
        elif s.startswith('def') and blocks[i-1][-1].splitlines()[-1].lstrip().startswith('@'):
            merge()

        # lines starting with else conditions (if *and* for *and* while!)
        elif s.startswith('else') and (blocks[i-1][-1].lstrip().startswith('if') or blocks[i-1][-1].lstrip().startswith('while') or blocks[i-1][-1].lstrip().startswith('for') or blocks[i-1][-1].lstrip().startswith('try') or blocks[i-1][-1].lstrip().startswith('elif')):
            merge()

        # lines starting with elif
        elif s.startswith('elif') and blocks[i-1][-1].lstrip().startswith('if'):
            merge()

        # do not merge blocks -- move on to next one
        else:
            i += 1

    return blocks




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
    import re
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

        chrs = set('.()[]? ')
        if not any(c in expr for c in chrs):
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
                if target == '' or is_valid_identifier(target) or '*' in expr and '* ' not in expr:
                    # this case includes list.*end[tab]
                    obj    = expr[:i]
                else:
                    # this case includes aaa=...;3 * aa[tab]
                    expr = guess_last_expression(target)
                    i = expr.rfind('.')
                    if i != -1:
                        target = expr[i+1:]
                        obj    = expr[:i]
                    else:
                        target = expr

        if get_completions and target == expr:
            j      = len(expr)
            if '*' in expr:
                # this case includes *_factors<TAB> and abc =...;3 * ab[tab]
                try:
                    pattern = expr.replace("*",".*").replace("?",".")
                    reg = re.compile(pattern+"$")
                    v = filter(reg.match, namespace.keys() + _builtin_completions)
                    # for 2*sq[tab]
                    if len(v) == 0:
                        gle = guess_last_expression(expr)
                        j = len(gle)
                        if j > 0:
                            target = gle
                            v = [x[j:] for x in (namespace.keys() + _builtin_completions) if x.startswith(gle)]
                except:
                    pass
            else:
                v = [x[j:] for x in (namespace.keys() + _builtin_completions) if x.startswith(expr)]
                # for 2+sqr[tab]
                if len(v) == 0:
                    gle = guess_last_expression(expr)
                    j = len(gle)
                    if j > 0 and j < len(expr):
                        target = gle
                        v = [x[j:] for x in (namespace.keys() + _builtin_completions) if x.startswith(gle)]
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
                except (SyntaxError, TypeError, AttributeError):
                    # If that fails, we try on a subexpression.
                    # TODO: This will not be needed when
                    # this code is re-written to parse using an
                    # AST, instead of using this lame hack.
                    obj = guess_last_expression(obj)
                    try:
                        O = eval(obj if not preparse else preparse_code(obj), namespace)
                    except:
                        pass
            finally:
                signal.signal(signal.SIGALRM, signal.SIG_IGN)

            def get_file():
                try:
                    import sage.misc.sageinspect
                    return "   File: " + eval('getdoc(O)', {'getdoc':sage.misc.sageinspect.sage_getfile, 'O':O}) + "\n"
                except Exception, err:
                    return "Unable to read source filename (%s)"%err

            if get_help:
                import sage.misc.sageinspect
                result = get_file()
                try:
                    def f(s):
                        try:
                            x = sage.misc.sageinspect.sage_getargspec(s)
                            defaults = list(x.defaults) if x.defaults else []
                            args = list(x.args) if x.defaults else []
                            v = []
                            if x.keywords:
                                v.insert(0,'**kwds')
                            if x.varargs:
                                v.insert(0,'*args')
                            while defaults:
                                d = defaults.pop()
                                k = args.pop()
                                v.insert(0,'%s=%r'%(k,d))
                            v = args + v
                            t = "   Signature : %s(%s)\n"%(obj, ', '.join(v))
                        except:
                            t = ""
                        try:
                            t += "   Docstring :\n" + sage.misc.sageinspect.sage_getdoc(s).strip()
                        except:
                            pass
                        return t
                    result += eval('getdoc(O)', {'getdoc':f, 'O':O})
                except Exception, err:
                    result += "Unable to read docstring (%s)"%err
                result = result.lstrip().replace('\n   ','\n')  # Get rid of the 3 spaces in front of everything.

            elif get_source:
                import sage.misc.sageinspect
                result = get_file()
                try:
                    result += "   Source:\n   " + eval('getsource(O)', {'getsource':sage.misc.sageinspect.sage_getsource, 'O':O})
                except Exception, err:
                    result += "Unable to read source code (%s)"%err

            elif get_completions:
                if O is not None:
                    v = dir(O)
                    if hasattr(O, 'trait_names'):
                        v += O.trait_names()
                    if not target.startswith('_'):
                        v = [x for x in v if x and not x.startswith('_')]
                    # this case excludes abc = ...;for a in ab[tab]
                    if '*' in expr and '* ' not in expr:
                        try:
                            pattern = target.replace("*",".*").replace("?",".")
                            reg = re.compile(pattern+"$")
                            v = filter(reg.match, v)
                        except:
                            pass
                    else:
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