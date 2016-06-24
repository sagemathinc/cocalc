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

class JUPYTER:

    def __call__(self, kernel_name):
        return jkmagic(kernel_name)

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

        | my_anaconda = jupyter("anaconda")
        | my_bash = jupyter("bash")


    """
        kspec = os.popen("jupyter kernelspec list").read()
        ks2 = string.replace(kspec, "kernels:\n ", "kernels:\n\n|")
        return ds0 + ks2

    __doc__ = property(_get_doc)
    
jupyter = JUPYTER()

import jupyter_client
from Queue import Empty

def jkmagic(kernel_name):
    r"""
    See docs for jupyter
    """

    # jupyter client state machine is inferred from sample code here:
    # https://github.com/JanSchulz/knitpy/blob/master/knitpy/knitpy.py#L458

    km, kc = jupyter_client.manager.start_new_kernel(kernel_name = kernel_name)
    if kernel_name in ("python3","anaconda3","python2","python2-ubuntu"):
        # suppress ansi color codes in error messages
        kc.execute("%colors NoColor")
    def run_code(code):

        # execute the code
        msg_id = kc.execute(code)

        # get responses
        shell = kc.shell_channel
        iopub = kc.iopub_channel

        # get shell messages until command is finished
        while True:
            try:
                # this blocks - maybe add timeout = nsec
                msg = shell.get_msg()
            except Empty:
                # shouldn't happen
                print "shell channel empty"
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
                print "iopub channel timeout"
                break

            if msg['parent_header'].get('msg_id') != msg_id:
                continue

            if msg_type == 'status':
                if content['execution_state'] == 'idle':
                    # when idle, kernel has executed all input
                    kernel_idle = True
                    break
                else:
                    continue
            elif msg_type == 'clear_output':
                continue
            elif msg_type == 'stream':
                if 'text' in content:
                    print(content['text'])
            elif msg_type == 'error':
                # XXX look for ename and evalue too?
                if 'traceback' in content:
                    for tr in content['traceback']:
                        print tr

        if not kernel_idle:
            # shouldn't happen
            print "end of processing and kernel not idle"

        return
    return run_code

