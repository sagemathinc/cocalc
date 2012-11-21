The Mercury HTML5 Editor is the original basis for one version of Salvus's worksheets.    It comes from
http://jejacks0n.github.com/mercury

I made this by taking the git repo, making my own build script in
Python to avoid the Ruby/RAILS madness (totally broken system!).

I deleted jquery-ui as a dep, since that's already in savlus.  I made
up the file src/base.js based on mercury-compiled.js, but all others
were exactly as is for the first version, at least.
