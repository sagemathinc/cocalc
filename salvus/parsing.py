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

def divide_into_blocks(code):
    code, literals, state = strip_string_literals(code)
    code = [x for x in code.splitlines() if x.strip()]  # remove blank lines
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
            
    return blocks




############################################

# Keywords from http://docs.python.org/release/2.7.2/reference/lexical_analysis.html
_builtin_completions = __builtins__.keys() + ['and', 'del', 'from', 'not', 'while', 'as', 'elif', 'global', 'or', 'with', 'assert', 'else', 'if', 'pass', 'yield', 'break', 'except', 'import', 'print', 'class', 'exec', 'in', 'raise', 'continue', 'finally', 'is', 'return', 'def', 'for', 'lambda', 'try']

def completions(code, namespace, docstring=False, preparse=True):
    result = []
    target = ''
    expr = ''
    try:
        code0, literals, state = strip_string_literals(code)
        # TODO: this has to be replaced by using ast on preparsed version.  Not easy.
        i = max([code0.rfind(t) for t in '\n;='])+1
        while i<len(code0) and code0[i] in string.whitespace:
            i += 1
        expr = code0[i:]%literals
        before_expr = code0[:i]%literals
        if not docstring and '.' not in expr and '(' not in expr and ')' not in expr and '?' not in expr:
            get_help = False
            target = expr
            j = len(expr)
            v = [x[j:] for x in (namespace.keys() + _builtin_completions) if x.startswith(expr)]
        else:
            i = max([expr.rfind(s) for s in '?('])
            if docstring and i == -1:
                get_help = True
                target = ''
                obj = expr
            else:
                if i == len(expr)-1:
                    get_help = True
                    target = expr[i+1:]
                    obj = expr[:i]
                else:
                    get_help = False
                    i = expr.rfind('.')
                    target = expr[i+1:]
                    obj = expr[:i]

            if obj in namespace:
                O = namespace[obj]
            else:
                O = None
                # the more dangerous eval.
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
                    print "obj='%s'"%obj
                    O = eval(obj if not preparse else preparse_code(obj), namespace)
                finally:
                    signal.signal(signal.SIGALRM, signal.SIG_IGN)
            if get_help:
                import sage.misc.sageinspect
                result = eval('f(obj)', {'obj':O, 'f':sage.misc.sageinspect.sage_getdoc})

            else:
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
        if not get_help:
            result = list(sorted(set(v), lambda x,y:cmp(x.lower(),y.lower())))
    except Exception, msg:
        traceback.print_exc()
        result = []
        status = 'ok'
    else:
        status = 'ok'
    return {'result':result, 'target':target, 'expr':expr, 'status':status, 'help':get_help}
