# Additional setup to perform after building and installing Sage
# This is broken out into a separate script so it can be run as
# a separate step in the Dockerfile without performing a full
# rebuild.

# Put scripts to start gap, gp, maxima, ... in /usr/bin
sage --nodotsage -c "install_scripts('/usr/bin')"

# Setup the admin password for Sage's lecacy notebook to avoid need for later
# user interaction
# This should also be run as the 'sage' user to ensure that the resulting
# configuration is written to their DOT_SAGE
sudo -H -u sage sage <<EOFSAGE
    from sage.misc.misc import DOT_SAGE
    from sagenb.notebook import notebook
    directory = DOT_SAGE+'sage_notebook'
    nb = notebook.load_notebook(directory)
    nb.user_manager().add_user('admin', 'sage', '', force=True)
    nb.save()
    quit
EOFSAGE

# Install additional Python packages into the sage Python distribution...
# Install terminado for terminal support in the Jupyter Notebook
sudo -H -u sage sage -pip install terminado
