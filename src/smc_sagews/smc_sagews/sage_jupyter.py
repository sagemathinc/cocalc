"""
sage_jupyter.py

Spawn and send commands to jupyter kernels.
"""

#########################################################################################
#       Copyright (C) 2016 William Stein <wstein@gmail.com>                             #
#                                                                                       #
#  Distributed under the terms of the GNU General Public License (GPL), version 2+      #
#                                                                                       #
#                  http://www.gnu.org/licenses/                                         #
#########################################################################################

import os
import string


# jupyter kernel magic

class JUPYTER(object):

    def __call__(self, kernel_name, **kwargs):
        return jkmagic(kernel_name, **kwargs)

    def _get_doc(self):
        ds0 = r"""
    Use the jupyter command to use any Jupyter kernel that you have installed using from your SageMathCloud worksheet.

        | my_python3 = jupyter("python3")

    After that, begin a sagews cell with the magic command to send statements to the kernel

        | %my_python3
        | print(42)

    Each magic command connects to its own kernel. So you can have more than
    one instance of the same kernel type.

        | my_second_python3 = jupyter("python3")

    Other kernels:

        | my_anaconda = jupyter("anaconda3")
        | my_bash = jupyter("bash")


    """
        print("calling JUPYTER._get_doc()")
        kspec = os.popen("jupyter kernelspec list").read()
        ks2 = string.replace(kspec, "kernels:\n ", "kernels:\n\n|")
        return ds0 + ks2

    __doc__ = property(_get_doc)

jupyter = JUPYTER()

import jupyter_client
from Queue import Empty
from ansi2html import Ansi2HTMLConverter
import os, tempfile, sys, re
import base64

def jkmagic(kernel_name, **kwargs):
    r"""
    See docs for jupyter
    """

    from sage_salvus import salvus

    # jupyter client state machine is inferred from sample code here:
    # https://gist.github.com/minrk/2620735
    # https://github.com/JanSchulz/knitpy/blob/master/knitpy/knitpy.py#L458

    km, kc = jupyter_client.manager.start_new_kernel(kernel_name = kernel_name)

    debug = kwargs['debug'] if 'debug' in kwargs else False

    def p(*args):
        if debug:
            print ' '.join(str(a) for a in args)

    conv = Ansi2HTMLConverter()

    # sets color styles for the page
    # including cells already run before using this magic
    salvus.html(conv.convert(""))

    def hout(s):
        from sage_salvus import salvus
        # `full = False` or else cell output is huge
        h = conv.convert(s, full = False)
        h2 = '<pre><span style="font-family:monospace;">'+h+'</span></pre>'
        salvus.html(h2)

    def run_code(code):

        from sage_salvus import salvus

        # execute the code
        msg_id = kc.execute(code)

        # get responses
        shell = kc.shell_channel
        iopub = kc.iopub_channel

        # get shell messages until command is finished
        while True:
            try:
                # this blocks
                msg = shell.get_msg()
            except Empty:
                # shouldn't happen
                p("shell channel empty")
            if msg['parent_header'].get('msg_id') == msg_id:
                break
            else:
                # not our reply
                continue

        # get messages until kernel idle
        kernel_idle = False
        while True:
            try:
                msg = iopub.get_msg(timeout=0.2)
                msg_type = msg['msg_type']
                content = msg['content']

            except Empty:
                # shouldn't happen
                p("iopub channel timeout")
                break

            if msg['parent_header'].get('msg_id') != msg_id:
                continue

            # trace jupyter protocol if debug enabled
            p(msg_type, str(content)[:300])

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
                        fo.close()
                        os.unlink(fname)

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
                    # convert display to inline for execution output
                    # this matches jupyter notebook behavior
                    ldata = re.sub("^\$\$(.*)\$\$$", "$\\1$", ldata)
                    salvus.html(ldata)
                elif 'text/markdown' in content['data']:
                    salvus.md(content['data']['text/markdown'])
                elif 'text/html' in content['data']:
                    import sage_server
                    prev_mhs = sage_server.MAX_HTML_SIZE
                    p('prev_mhs',prev_mhs)
                    sage_server.MAX_HTML_SIZE = 2000000

                    prev_mo = sage_server.MAX_OUTPUT
                    p('prev_mo',prev_mo)
                    sage_server.MAX_OUTPUT = 2000000

                    salvus.html(content['data']['text/html'])
                    sage_server.MAX_HTML_SIZE = prev_mhs
                    sage_server.MAX_OUTPUT = prev_mo
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
                    kernel_idle = True
                    break
                else:
                    continue

            elif msg_type == 'clear_output':
                salvus.clear()

            elif msg_type == 'stream':
                if 'text' in content:
                    hout(content['text'])

            elif msg_type == 'error':
                # XXX look for ename and evalue too?
                if 'traceback' in content:
                    for tr in content['traceback']:
                        hout(tr)

        if not kernel_idle:
            # shouldn't happen
            p("end of processing and kernel not idle")

        return

    return run_code

