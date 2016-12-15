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

if [ -d "/ext/anaconda" ] ; then
  export ANACONDA3="/ext/anaconda"
else
  export ANACONDA3="/projects/anaconda3"
fi
  

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

   # and alias pip to pip --user for non-root and non-salvus users
   PIP2=`which pip2`
   PIP3=`which pip3`

   __pip () {
    P=PIP$1
    PIP=${!P}
    shift
    if [[ "$1" == "install" ]]; then
        shift
        $PIP install --user $@
    else
        $PIP $@
    fi
   }

   pip  () { __pip 2 $@; }
   pip2 () { __pip 2 $@; }
   pip3 () { __pip 3 $@; }
  # END aliasing pip, pip2 and pip3

  # This is mainly for SageMath, i.e. instead of pointing to its own local dir,
  # this points to the users read-writeable directory.
  # sagemath tickets: 14243, 18955
  if [ -z "$PYTHONUSERBASE" ]; then
    PYTHONUSERBASE="$HOME/.local"
    export PYTHONUSERBASE
  fi
fi

# colored man pages
# credits: http://boredzo.org/blog/archives/2016-08-15/colorized-man-pages-understood-and-customized
man() {
    env \
        LESS_TERMCAP_mb=$(printf "\e[1;31m") \
        LESS_TERMCAP_md=$(printf "\e[1;31m") \
        LESS_TERMCAP_me=$(printf "\e[0m") \
        LESS_TERMCAP_se=$(printf "\e[0m") \
        LESS_TERMCAP_so=$(printf "\e[1;44;33m") \
        LESS_TERMCAP_ue=$(printf "\e[0m") \
        LESS_TERMCAP_us=$(printf "\e[1;32m") \
            man "$@"
}

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

# Tell the sfl4j logger (and similar) to use a local tmp directory and not the global  one in /tmp/
# This came up with running the jupyter-scala kernel
jtmp=~/tmp/
eval jtmp=$jtmp  # this expands the ~ for the user since java does not do it
# the -Xms option should be the same as in /etc/enviornment -- accessing the variable here doesn't work
export _JAVA_OPTIONS="-Djava.io.tmpdir=$jtmp -Xms64m"

# Julia packages are globally installed right here
export JULIA_PKGDIR=/usr/local/share/julia/site/

# source an additional setup script when it exists in /ext/init.sh
test -x /ext/init.sh && . /ext/init.sh
