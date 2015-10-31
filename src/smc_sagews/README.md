This is the SageMathCloud Sage server.

To install into a copy of Sage, do this:

   sage -pip install --upgrade ./

You will also probably want to install smc_pyutil systemwide.  It provides a script smc-sage-server that just does

   sage -python -c "from smc_sagews.sage_server_command_line import main; main('$1')"
