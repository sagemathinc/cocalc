def f1(arg, *args, **kwargs):
    print 'f1 arg = %r'%arg
    for count,v in enumerate(args):
        print 'f1 *args',count,v
    for k,v in kwargs.items():
        print 'f1 **kwargs',k,v
    print "test f1 1"
