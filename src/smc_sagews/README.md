# SageMathCloud Sage server

## Install

To install into a copy of Sage, do this:

    sage -pip install --upgrade ./

You will also probably want to install smc_pyutil systemwide.  It provides a script `smc-sage-server` for starting/stopping the server.

## Development

In any project, just do this:

    cd smc/src/smc_sagews
    smc-sage-server restart

Then on a sage worksheet that you are using, click the restart button.
It should be using your own custom copy of the smc_sagews server.
To confirm, type `sage_server?` and look at the path of the file.

## Testing

See smc_sagews/tests/README.md