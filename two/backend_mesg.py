######################################################################
# Constants that we use when encoding messages.
# We make them attributes of a class to avoid typos.
messages = ['status', 'running', 'done',
            'stdout', 'stderr',
            'code', 'result', 'exception',
            'cmd', 'execute', 'evaluate', 'preparse']
class MESG(object):
    pass
for n, k in enumerate(messages):
    setattr(MESG, k, k)
    
