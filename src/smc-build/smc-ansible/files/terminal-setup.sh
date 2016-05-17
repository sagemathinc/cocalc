# {{ ansible_managed }}

path-prepend () {
  if ! echo $PATH | /bin/egrep -q "(^|:)$1($|:)" ; then
    PATH="$1":"$PATH"
  fi
}

path-append () {
  if ! echo $PATH | /bin/egrep -q "(^|:)$1($|:)" ; then
    PATH="$PATH":"$1"
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
   echo "             ┌───────────────────────────────────────────────────┐              "
   echo "┌────────────┤ Welcome to the SageMathCloud Terminal Environment ├─────────────┐"
   echo "│            └───────────────────────────────────────────────────┘             │"
   echo "│ Software: sage R ipython gap gp git latexmk isympy java julia octave python3 │"
   echo "│ vim emacs nano joe gcc clang ocaml pdflatex xetex node convert mc htop atop …│"
   echo "│                                                    ┌─────────────────────────┤"
   echo "│ Anaconda Python [continuum.io]: anaconda3          │ Usage: type command and │"
   echo "│                ... and exit it:  exit-anaconda     │ then hit the return key │"
   echo "│                                                    └─────────────────────────┤"
   echo "│ Learn about the Linux terminal:     http://ryanstutorials.net/linuxtutorial/ │"
   echo "│ Experiencing any problems or is something missing?   email help@sagemath.com │"
   echo "└──────────────────────────────────────────────────────────────────────────────┘"
   echo ""
fi

export SAGE_ATLAS_LIB=/usr/lib/   # do not build ATLAS

path-prepend "$HOME/.local/bin"
path-prepend "$HOME/bin"
path-append  "/projects/data/homer/bin"
path-append  "/projects/data/weblogo"
export PATH
