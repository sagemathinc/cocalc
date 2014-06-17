
I removed png fonts:

rm -rf fonts/HTML-CSS/TeX/png

I made these two symlinks:

wstein@u:~/salvus/salvus/static/mathjax/extensions$ ln -s ../../xyjax/fp.js .                                                        
wstein@u:~/salvus/salvus/static/mathjax/extensions$ cd TeX/                                                                          
wstein@u:~/salvus/salvus/static/mathjax/extensions/TeX$ ln -s ../../../xyjax/xypic-min.js xypic.js   
