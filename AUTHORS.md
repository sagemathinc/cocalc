# Authors

William Stein ([wstein@sagemath.com](mailto:wstein@sagemath.com)) wrote most of SageMathCloud.  See the git history, which as of Oct 30, 2015, has 96% commits by him.  This needs to change.

Everytime the GPL licensing note refers to the _"Authors of SageMathCloud"_, the following  (maybe incomplete) list is meant.

* Keith Clawson
* Russ Hensel
* Jonathan Lee
* Andrew Ohana
* Bill Page
* Issa Rice
* Nicholas Ruhland
* Harald Schilly
* William Stein
* Christopher Swenson
* Vivek Venkatachalam
* Travis Scholl


## Git Authors

To extract the names of all Git contributors,
run this piece of Python code inside the codebase:

    from subprocess import check_output
    authors = check_output(['git', 'log', '--pretty=format:"%aN <%aE>"', 'HEAD'])
    sortkey = lambda n : n.split("<",1)[0].split()[-1].lower() if "<" in n else n
    for name in sorted(set(authors.splitlines()), key = sortkey):
        print(name)