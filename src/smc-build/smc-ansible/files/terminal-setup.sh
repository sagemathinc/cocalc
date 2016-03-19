# {{ ansible_managed }}

path-prepend () {
  if ! echo $PATH | /bin/egrep -q "(^|:)$1($|:)" ; then
    PATH="$1":"$PATH"
  fi
}

path-remove () {
    PATH=${PATH//":$1:"/:} #delete all instances in the middle
    PATH=${PATH/%":$1"/}   #delete any instance at the end
    PATH=${PATH/#"$1:"/}   #delete any instance at the beginning
}

export ANACONDA3="/projects/anaconda3"

anaconda3 () {
    source $ANACONDA3/bin/activate root
}

exit-anaconda () {
    source deactivate
}

# show banner only in "i" == "interactive mode" (i.e. safe for running bash scripts)
if [[ $- =~ i  && `whoami` != "root"  && `whoami` != "salvus" ]]; then
   echo "┌──────────────────────────────────────────────────────────────────────────────────┐"
   echo "│                Welcome to the SageMathCloud Terminal Environment                 │"
   echo "│                                                                                  │"
   echo "│ Software: sage, R, ipython, gap, gp, git, latexmk, isympy, java, julia, octave,  │"
   echo "│ vim, emacs, nano, gcc, clang, pdflatex, xetex, node, convert, mc, htop, atop, ...│"
   echo "│                                                        ┌─────────────────────────┤"
   echo "│ Anaconda Python environment:  anaconda3                │ Usage: type command in  │"
   echo "│    ... and to exit Anaconda:  exit-anaconda            │ then hit the return key │"
   echo "│                                                        └─────────────────────────┤"
   echo "│ Learn about the Linux Bash terminal:    http://ryanstutorials.net/linuxtutorial/ │"
   echo "│ Are there any problems or is something missing?    email us at help@sagemath.com │"
   echo "└──────────────────────────────────────────────────────────────────────────────────┘"
   echo ""
fi

export SAGE_ATLAS_LIB=/usr/lib/   # do not build ATLAS

path-prepend "$HOME/.local/bin"
path-prepend "$HOME/bin"
export PATH
