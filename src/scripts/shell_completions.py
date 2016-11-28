#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



# Known bugs/oddities:
#   [ ] Fails to correctly detect the prompt with certain .bashrc settings.
#   [X] Spurious empty strings/escape sequences appear with multi-page output.
#   [ ] Output is not consistent. Example: 'git stat' returns 'git status', while
#       'git sta' returns a list of completions only for the 'sta' part of the 
#       command.

import argparse, pexpect, sys

COMPLETIONS_COMMAND = ". /etc/bash_completion"
BIGLIST_WARNING = "(y or n)"
NEXT_PAGE_INDICATOR = "--More--"
DEFAULT_TIMEOUT=2
DEFAULT_SHELL="bash"


def print_string(message, string):
    print message + " \"" + string + "\""


def completions(partial_command, shell=DEFAULT_SHELL, return_raw=False, 
                import_completions=True, get_prompt=True, prompt="$ ",
                timeout=DEFAULT_TIMEOUT, biglist=True, verbose=False,
                logfile=None):
    """
    Returns a list containing the tab completions found by the shell for the 
    input string.
    """

    child = pexpect.spawn(shell, timeout=timeout)

    if verbose:
        child.logfile = sys.stdout

    if logfile is not None:
        logfile = open(logfile, "w")
        child.logfile = logfile 

    # We want to echo characters sent to the shell so that new prompts print
    # on their own line.
    child.setecho(True)

    # echo_on = child.getecho()
    # if verbose:
    #    print "Echo state: " + str(echo_on)

    # Get a bare command prompt in order to find the end of the
    # list of completions.
    if get_prompt:

        # !!!
        # Here we assume that the shell will only print out a command
        # prompt on startup. This is not always true.
        # !!!
        child.sendline()
        child.expect_exact("\r\n")
        prompt = child.before

        # We just hit enter, so we expect the shell to print a new prompt and
        # we need to clear it out of the buffer.
        child.expect_exact(prompt)

        if verbose:
            print_string("Prompt:", prompt)

    # Run a script to configure extra bash completions.
    if import_completions:
        child.sendline(COMPLETIONS_COMMAND)
        child.expect_exact(prompt)

    child.send(partial_command + "\t\t")
    child.expect_exact(partial_command)
    #### NOTE: I don't understand why this time we don't get an echo.
    ####       New idea: Of course... it's only echoing the sent characters.
    # child.expect_exact(partial_command)

    index = child.expect_exact([" ", "\r\n", pexpect.TIMEOUT])

    if index == 0:
        # Bash found a single completion and filled it in.
        return [partial_command + child.before]

    elif index == 1:
        index = child.expect_exact([BIGLIST_WARNING, NEXT_PAGE_INDICATOR, prompt])
        if index == 0 or index == 1:
            # The shell found too many completions to list on one screen.
            if biglist:
                completions = ""

                # For very long lists the shell asks whether to continue.
                if index == 0:
                    child.send("y")
                
                # Shorter lists print to the screen without asking. 
                else:
                    completions += child.before
                    child.send(" ")
                
                # Keep sending space to get more pages until we get back to the 
                # command prompt.
                while True:
                    index = child.expect_exact([NEXT_PAGE_INDICATOR, prompt])
                    completions += child.before
                    if index == 0:
                        child.send(" ")
                    elif index == 1:
                        break
                
                # Remove spurious escape sequence.
                completions = completions.replace("\x1b[K", "")

        elif index == 2:
            # Bash found more than one completion and listed them on multiple lines.
            # child.expect_exact(prompt)
            completions = child.before
 
    elif index == 2:
        # If the command timed out, either no completion was found or it
        # found a single completion witout adding a space (for instance, this 
        # happens when completing the name of an executable).

        # print_string("Timed out:", child.before)

        # Remove any bell characters the shell appended to the completion.
        return [partial_command + child.buffer.replace("\x07", "")]
    
    child.close()

    # Parse the completions into a Python list of strings.
    return completions.split()


if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(
        description="Returns the tab completions found by the shell for the input string.")

    parser.add_argument("COMMAND", type=str,
                        help="The partial command that the shell should attempt to complete.")

    parser.add_argument("--no_biglists", action="store_false", default=True,
                        help="Abort execution if the shell finds a large number of completions.")

    parser.add_argument("--no_detect_prompt", action="store_false", default=True,
                        help="Don't attempt to detect the command prompt, and use a built-in constant instead. This should speed up execution times.")

    parser.add_argument("--no_import_completions", default=True,
                        help="Don't set up completions by running the script at /etc/completions.")
    parser.add_argument("--raw", action="store_false", default=False,
                        help="Returns all output from the shell without formatting changes.")

    parser.add_argument("--separator", "-s", default="\n",
                        help="Character used to separate the list of completions.")

    parser.add_argument("--shell", default="bash",
                        help="The shell to query for completions. Defaults to bash.")

    parser.add_argument("--timeout", "-t", metavar="SECONDS", type=float, default=DEFAULT_TIMEOUT,
                        help="The time in seconds before the program detects no shell output.")

    parser.add_argument("--verbose", "-v", action="store_true", default=False,
                        help="Verbose mode.")

    parser.add_argument("--log", "-l", metavar="LOGFILE", default=None,
                        help="Log all shell output to file named LOGFILE.")

    args = parser.parse_args()

    completion_list = completions(args.COMMAND, verbose=args.verbose, 
        return_raw=args.raw, get_prompt=args.no_detect_prompt, 
        timeout=args.timeout, biglist=args.no_biglists, logfile=args.log)

    print str(args.separator).join(completion_list)