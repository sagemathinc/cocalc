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
octave = jupyter('octave')

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
    km, kc = jupyter_client.manager.start_new_kernel(kernel_name = kernel_name)

    kn = kernel_name
    i_am_a_jupyter_client = True

    debug = kwargs['debug'] if 'debug' in kwargs else False

    def p(*args):
        if debug:
            print ' '.join(str(a) for a in args)

    # inline: no header or style tags, useful for full == False
    # linkify: little gimmik, translates URLs to anchor tags
    conv = Ansi2HTMLConverter(inline=True, linkify=True)

    salvus.html(conv.convert(""))

    def hout(s, block = True, scroll = False):
        r"""
        wrapper for ansi conversion before displaying output

        INPUT:

        -  ``block`` - set false to prevent newlines between output segments

        -  ``scroll`` - set true to put output into scrolling div
        """
        # `full = False` or else cell output is huge
        h = conv.convert(s, full = False)
        if block:
            h2 = '<pre style="font-family:monospace;">'+h+'</pre>'
        else:
            h2 = '<pre style="display:inline-block;margin-right:-1ch;font-family:monospace;">'+h+'</pre>'
        if scroll:
            h2 = '<div style="max-height:320px;width:80%;overflow:auto;">' + h2 + '</div>'
        salvus.html(h2)

    def run_code(code):

        # these are used by the worksheet process
        if (not i_am_a_jupyter_client) or len(kn) == 0:
            return

        # execute the code
        msg_id = kc.execute(code)

        # get responses
        shell = kc.shell_channel
        iopub = kc.iopub_channel
        stdinj = kc.stdin_channel

        # buffering for %capture because we don't know whether output is stdout or stderr
        # until shell execute_reply messasge is received with status 'ok' or 'error'
        capture_out = ""

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
                for mime, data in msg_data.iteritems():
                    p('mime',mime)
                    # when there is latex, it takes precedence over the text representation
                    if mime == 'text/html' or mime == 'text/latex':
                        salvus.html(data)
                    elif mime == 'text/markdown':
                        salvus.md(data)
                    # this test is super cheap, we should be explicit of the mime types here
                    elif any(_ in mime for _ in ['png', 'jpeg', 'svg']):
                        # below is handling of images, etc.
                        attr = mime.split('/')[-1].lower()
                        # fix svg+html, plain
                        #attr = attr.replace('+xml', '').replace('plain', 'text')
                        p("attr",attr)
                        if len(data) > 200:
                            p(data[:100]+'...'+data[-100:])
                        else:
                            p(data)
                        # https://en.wikipedia.org/wiki/Data_scheme#Examples
                        # <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEU
                        # <img src='data:image/svg+xml;utf8,<svg ... > ... </svg>'>
                        if 'svg' in mime:
                            fname = tempfile.mkstemp(suffix=".svg")[1]
                        else:
                            data = base64.standard_b64decode(data)
                            fname = tempfile.mkstemp(suffix="." + attr)[1]
                        with open(fname,'w') as fo:
                            fo.write(data)
                        p(fname)
                        salvus.file(fname)
                        os.unlink(fname)
                        # ir kernel sends png then svg+xml; don't display both
                        break

                    elif mime == 'text/plain':
                        continue

            # dispatch control or display calls depending on the message type
            if msg_type == 'execute_result':
                if not 'data' in content:
                    continue
                p('execute_result data keys: ',content['data'].keys())
                out_prefix = ""
                if 'execution_count' in content:
                    out_data = "Out [%d]: "%content['execution_count']
                    # don't want line break after this
                    sys.stdout.write(out_data)
                if 'text/latex' in content['data']:
                    ldata = content['data']['text/latex']
                    if re.match('\W*begin{tabular}',ldata):
                        # sagemath R emits latex tabular output, not supported by MathJAX
                        import sage.misc.latex
                        sage.misc.latex.latex.eval(ldata)
                    else:
                        # convert display to inline for execution output
                        # this matches jupyter notebook behavior
                        ldata = re.sub("^\$\$(.*)\$\$$", "$\\1$", ldata)
                        salvus.html(ldata)
                elif 'image/png' in content['data']:
                    display_mime(content['data'])
                elif 'text/markdown' in content['data']:
                    display_mime(content['data'])
                elif 'text/html' in content['data']:
                    display_mime(content['data'])
                elif 'text/plain' in content['data']:
                    # don't show text/plain if there is latex content
                    # display_mime(content['data'])
                    sys.stdout.write(content['data']['text/plain'])

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
                    if hasattr(sys.stdout._f, 'im_func'):
                        if 'name' in content and content['name'] == 'stderr':
                            sys.stderr.write(content['text'])
                            sys.stderr.flush()
                        else:
                            hout(content['text'],block = False)
                    else:
                        # %capture mode
                        capture_out += content['text'].replace('\r','')

            elif msg_type == 'error':
                # XXX look for ename and evalue too?
                if 'traceback' in content:
                    tr = content['traceback']
                    if isinstance(tr, list):
                        for tr in content['traceback']:
                            hout(tr)
                    else:
                        hout(tr)

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
                    if hasattr(sys.stdout._f, 'im_func'):
                        if content['status'] == 'ok':
                            if 'payload' in content:
                                payload = content['payload']
                                if len(payload) > 0:
                                    if 'data' in payload[0]:
                                        data = payload[0]['data']
                                        if 'text/plain' in data:
                                            text = data['text/plain']
                                            hout(text, scroll = True)
                    else:
                        # %capture mode
                        if content['status'] == 'ok':
                            print(capture_out)
                        elif content['status'] == 'error':
                            sys.stderr.write(capture_out)
                            sys.stderr.flush()
                    break
            else:
                # not our reply
                continue
        return

    return run_code

