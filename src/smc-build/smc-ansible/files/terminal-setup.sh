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

export ANACONDA3="/ext/anaconda"

anaconda3 () {
    source "$ANACONDA3/bin/activate" root
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

path-prepend "/ext/bin"
path-prepend "$HOME/.local/bin"
path-prepend "$HOME/bin"
export PATH

# locales -- compare with k8s/smc-project's base image Dockerfile
export LC_ALL=C.UTF-8
export LANG=en_US.UTF-8
export LANGUAGE=en_US:en

# less: setup highlighting when searching for a string
export LESS_TERMCAP_so=$'\E[;7m'
export LESS_TERMCAP_se=$'\E[;27m'

# Julia packages are globally installed right here
export JULIA_PKGDIR=/usr/local/share/julia/site/

# run an additional setup script when it exists in /ext/init.sh
test -x /ext/init.sh && /ext/init.sh
