"""
sage_jupyter.py

Spawn and send commands to jupyter kernels.

AUTHORS:
  - Hal Snyder (main author)
  - William Stein
  - Harald Schilly
"""

#########################################################################################
#       Copyright (C) 2016, SageMath, Inc.                                              #
#                                                                                       #
#  Distributed under the terms of the GNU General Public License (GPL), version 2+      #
#                                                                                       #
#                  http://www.gnu.org/licenses/                                         #
#########################################################################################

import os
import string
import textwrap

salvus = None  # set externally

# jupyter kernel

class JUPYTER(object):

    def __call__(self, kernel_name, **kwargs):
        return _jkmagic(kernel_name, **kwargs)

    def available_kernels(self):
        '''
        Returns the list of available Jupyter kernels.
        '''
        return os.popen("jupyter kernelspec list").read()

    def _get_doc(self):
        ds0 = textwrap.dedent(r"""\
        Use the jupyter command to use any Jupyter kernel that you have installed using from your SageMathCloud worksheet

            | py3 = jupyter("python3")

        After that, begin a sagews cell with %py3 to send statements to the Python3
        kernel that you just created:

            | %py3
            | print(42)

        You can even draw graphics.

            | %py3
            | import numpy as np; import pylab as plt
            | x = np.linspace(0, 3*np.pi, 500)
            | plt.plot(x, np.sin(x**2))
            | plt.show()

        You can set the default mode for all cells in the worksheet. After putting the following
        in a cell, click the "restart" button, and you have an anaconda worksheet.

            | %auto
            | anaconda3 = jupyter('anaconda3')
            | %default_mode anaconda3

        Each call to jupyter creates its own Jupyter kernel. So you can have more than
        one instance of the same kernel type in the same worksheet session.

            | p1 = jupyter('python3')
            | p2 = jupyter('python3')
            | p1('a = 5')
            | p2('a = 10')
            | p1('print(a)')   # prints 5
            | p2('print(a)')   # prints 10

        For details on supported features and known issues, see the SMC Wiki page:
        https://github.com/sagemathinc/smc/wiki/sagejupyter
        """)
        # print("calling JUPYTER._get_doc()")
        kspec = self.available_kernels()
        ks2 = string.replace(kspec, "kernels:\n ", "kernels:\n\n|")
        return ds0 + ks2

    __doc__ = property(_get_doc)

jupyter = JUPYTER()

import jupyter_client
from Queue import Empty
from ansi2html import Ansi2HTMLConverter
import tempfile, sys, re
import base64


def _jkmagic(kernel_name, **kwargs):
    r"""
    Called when user issues `my_kernel = jupyter("kernel_name")` from a cell, not intended to be called directly by user.

    Start a jupyter kernel and create a sagews function for it. See docstring for class JUPYTER above.
    Based on http://jupyter-client.readthedocs.io/en/latest/api/index.html

    INPUT:

    -  ``kernel_name`` -- name of kernel as it appears in output of `jupyter kernelspec list`

    -  ``debug`` - optional, set true to view jupyter messages

    """
    import warnings
    import sage.misc.latex
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        km, kc = jupyter_client.manager.start_new_kernel(kernel_name = kernel_name)
        import sage.interfaces.cleaner
        sage.interfaces.cleaner.cleaner(km.kernel.pid,"km.kernel.pid")
        import atexit
        atexit.register(km.shutdown_kernel)
        atexit.register(kc.hb_channel.close)

    debug = kwargs['debug'] if 'debug' in kwargs else False

    def p(*args):
        if debug:
            print ' '.join(str(a) for a in args)

    # inline: no header or style tags, useful for full == False
    # linkify: little gimmik, translates URLs to anchor tags
    conv = Ansi2HTMLConverter(inline=True, linkify=True)

    def hout(s, block = True, scroll = False, error = False):
        r"""
        wrapper for ansi conversion before displaying output

        INPUT:

        -  ``block`` - set false to prevent newlines between output segments

        -  ``scroll`` - set true to put output into scrolling div

        -  ``error`` - set true to send text output to stderr
        """
        # `full = False` or else cell output is huge
        if "\x1b[" in s:
            h = conv.convert(s, full = False)
            if block:
                h2 = '<pre style="font-family:monospace;">'+h+'</pre>'
            else:
                h2 = '<pre style="display:inline-block;margin-right:-1ch;font-family:monospace;">'+h+'</pre>'
            if scroll:
                h2 = '<div style="max-height:320px;width:80%;overflow:auto;">' + h2 + '</div>'
            salvus.html(h2)
        else:
            if error:
                sys.stderr.write(s)
                sys.stderr.flush()
            else:
                sys.stdout.write(s)
                sys.stdout.flush()

    def run_code(code=None, **kwargs):

        if kwargs.get('get_kernel_client',False):
            return kc

        if kwargs.get('get_kernel_manager',False):
            return km

        if kwargs.get('get_kernel_name',False):
            return kernel_name

        if code is None:
            return

        # execute the code
        msg_id = kc.execute(code)

        # get responses
        shell = kc.shell_channel
        iopub = kc.iopub_channel
        stdinj = kc.stdin_channel

        # buffering for %capture because we don't know whether output is stdout or stderr
        # until shell execute_reply message is received with status 'ok' or 'error'
        capture_mode = not hasattr(sys.stdout._f, 'im_func')

        # handle iopub messages
        while True:
            try:
                msg = iopub.get_msg()
                msg_type = msg['msg_type']
                content = msg['content']

            except Empty:
                # shouldn't happen
                p("iopub channel empty")
                break

            if msg['parent_header'].get('msg_id') != msg_id:
                continue

            if msg_type == 'status' and content['execution_state'] == 'idle':
                break

            # trace jupyter protocol if debug enabled
            p('iopub', msg_type, str(content)[:300])

            def display_mime(msg_data):
                '''
                jupyter server does send data dictionaries, that do contain mime-type:data mappings
                depending on the type, handle them in the salvus API
                '''
                # sometimes output is sent in several formats
                # 1. if there is an image format, prefer that
                # 2. elif default text or image mode is available, prefer that
                # 3. else choose first matching format in modes list
                mkeys = msg_data.keys()
                imgmodes = ['image/svg+xml', 'image/png', 'image/jpeg']
                txtmodes = ['text/html', 'text/plain', 'text/latex', 'text/markdown']
                if any('image' in k for k in mkeys):
                    # XXX to get svg format with R ("ir") kernel, will need something like @ws workaround:
                    # from sage_salvus.py#L2073
                    #    try:
                    #        r_dev_on = True
                    #        tmp = '/tmp/' + uuid() + '.svg'
                    #        r_eval0("svg(filename='%s'%s)"%(tmp, _r_plot_options))
                    #        s = r_eval0(code, *args, **kwds)
                    #        r_eval0('dev.off()')
                    #        return s
                    #    finally:
                    #        r_dev_on = False
                    #        if os.path.exists(tmp):
                    #            salvus.stdout('\n'); salvus.file(tmp, show=True); salvus.stdout('\n')
                    #            os.unlink(tmp)
                    #print('image')
                    dfim = run_code.default_image_fmt
                    #print('default_image_fmt %s'%dfim)
                    dispmode = next((m for m in mkeys if dfim in m), None)
                    if dispmode is None:
                        dispmode = next(m for m in imgmodes if m in mkeys)
                    #print('dispmode is %s'%dispmode)
                    # https://en.wikipedia.org/wiki/Data_scheme#Examples
                    # <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEU
                    # <img src='data:image/svg+xml;utf8,<svg ... > ... </svg>'>
                    if dispmode == 'image/svg+xml':
                        data = msg_data[dispmode]
                        fname = tempfile.mkstemp(suffix=".svg")[1]
                        with open(fname,'w') as fo:
                            fo.write(data)
                        salvus.file(fname)
                        os.unlink(fname)
                    elif dispmode == 'image/png':
                        data = base64.standard_b64decode(msg_data[dispmode])
                        fname = tempfile.mkstemp(suffix=".png")[1]
                        with open(fname,'w') as fo:
                            fo.write(data)
                        salvus.file(fname)
                        os.unlink(fname)
                    elif dispmode == 'image/jpeg':
                        data = base64.standard_b64decode(msg_data[dispmode])
                        fname = tempfile.mkstemp(suffix=".jpg")[1]
                        with open(fname,'w') as fo:
                            fo.write(data)
                        salvus.file(fname)
                        os.unlink(fname)
                    return
                elif any('text' in k for k in mkeys):
                    dftm = run_code.default_text_fmt
                    if capture_mode:
                        dftm = 'plain'
                    #print('default_text_fmt %s'%dftm)
                    dispmode = next((m for m in mkeys if dftm in m), None)
                    if dispmode is None:
                        dispmode = next(m for m in txtmodes if m in mkeys)
                    #print('dispmode is %s'%dispmode)
                    if dispmode == 'text/plain':
                        txt = re.sub(r"^\[\d+\] ", "", msg_data[dispmode])
                        sys.stdout.write(txt)
                        sys.stdout.flush()
                    elif dispmode == 'text/html':
                        salvus.html(msg_data[dispmode])
                    elif dispmode == 'text/latex':
                        sage.misc.latex.latex.eval(msg_data[dispmode])
                    elif dispmode == 'text/markdown':
                        salvus.md(msg_data[dispmode])
                    return


            # dispatch control or display calls depending on the message type
            if msg_type == 'execute_result':
                if not 'data' in content:
                    continue
                p('execute_result data keys: ',content['data'].keys())
                display_mime(content['data'])

            elif msg_type == 'display_data':
                if 'data' in content:
                    display_mime(content['data'])

            elif msg_type == 'status':
                if content['execution_state'] == 'idle':
                    # when idle, kernel has executed all input
                    break
                else:
                    continue

            elif msg_type == 'clear_output':
                salvus.clear()

            elif msg_type == 'stream':
                if 'text' in content:
                    # bash kernel uses stream messages with output in 'text' field
                    # might be ANSI color-coded
                    if 'name' in content and content['name'] == 'stderr':
                        hout(content['text'], error = True)
                    else:
                        hout(content['text'],block = False)

            elif msg_type == 'error':
                # XXX look for ename and evalue too?
                if 'traceback' in content:
                    tr = content['traceback']
                    if isinstance(tr, list):
                        for tr in content['traceback']:
                            hout(tr+'\n', error = True)
                    else:
                        hout(tr, error = True)

        # handle shell messages
        while True:
            try:
                msg = shell.get_msg(timeout = 0.2)
                msg_type = msg['msg_type']
                content = msg['content']
            except Empty:
                # shouldn't happen
                p("shell channel empty")
                break
            if msg['parent_header'].get('msg_id') == msg_id:
                p('shell', msg_type, len(str(content)), str(content)[:300])
                if msg_type == 'execute_reply':
                    if content['status'] == 'ok':
                        if 'payload' in content:
                            payload = content['payload']
                            if len(payload) > 0:
                                if 'data' in payload[0]:
                                    data = payload[0]['data']
                                    if 'text/plain' in data:
                                        text = data['text/plain']
                                        hout(text, scroll = True)
                    break
            else:
                # not our reply
                continue
        return
    # 'html', 'plain', 'latex', 'markdown'
    run_code.default_text_fmt = 'html'

    # 'svg', 'png', 'jpeg'
    run_code.default_image_fmt = 'svg'

    return run_code

