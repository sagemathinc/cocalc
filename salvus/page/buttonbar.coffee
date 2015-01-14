###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
Definition and control logic behind the various button bars.

There is a level of separation between the button bar's and the actual content what they insert/modify.
This is motivated by editing text, where various markups have different realizations ("B"old button -> **abc** or <b>abc</b>)

There are less/none overlaps for programming languages.

TODO:
    * initial examples for Sage, LaTeX, R
    * think about creating a dedicated dialog for more elaborate examples,
      which should also have a client/server communication to avoid bloat
      (think of a repository of hundrets of full examples with explanatory text)
    * work out how codemirror should react if there is a text selected or multiple cursors active (just the primary one!?)

CONSIDERATIONS:
    * buttons should insert code which immediately works:
      it's easier for users to delete lines than to end up with some partial broken fragments
###

{defaults} = require('misc')

exports.FONT_FACES = FONT_FACES = 'Serif,Sans,Arial,Arial Black,Courier,Courier New,Comic Sans MS,Georgia,Helvetica,Impact,Lucida Grande,Lucida Sans,Monaco,Palatino,Tahoma,Times New Roman,Verdana'.split(',')

exports.commands =
    tex :
        comment:
            wrap:
                left  : '% '
        integral:
                insert: '$\int_{0}^{\infty} \frac{1}{1+x^2}\,\mathrm{d}x$'
        cases:
                insert: """
                        $$
                        f(n) =
                        \begin{cases}
                            2 (n+1)    & \text{if} n \equiv 0 \\
                            (3n+1)/2   & \text{if} n \equiv 1.
                        \end{cases}
                        $$
                        """
        bold :
            wrap :
                left  : '\\textbf{'
                right : '}'
        italic :
            wrap :
                left  : '\\textit{'
                right : '}'
        underline :
            wrap :
                left  : '\\underline{'
                right : '}'
        insertunorderedlist :
            wrap :
                left  : "\\begin{itemize}\n    \\item\n"
                right : "\\end{itemize}"
        insertorderedlist :
            wrap :
                left  : "\\begin{enumerate}\n    \\item\n"
                right : "\\end{enumerate}"
        format_heading_1 :
            strip : ['format_heading_2','format_heading_3','format_heading_4']
            wrap :
                left  : "\\section{"
                right : "}"
        format_heading_2 :
            strip : ['format_heading_1','format_heading_3','format_heading_4']
            wrap :
                left  : "\\subsection{"
                right : "}"
        format_heading_3 :
            strip : ['format_heading_1','format_heading_2','format_heading_4']
            wrap :
                left  : "\\subsubsection{"
                right : "}"
        format_heading_4 :
            strip : ['format_heading_1','format_heading_2','format_heading_4']
            wrap :
                left  : "\\subsubsubsection{"
                right : "}"
        format_code :
            wrap :
                left  : '\n\\begin{verbatim}\n'
                right : '\n\\end{verbatim}\n'
        indent :
            wrap :
                left  : "\n\\begin{quote}\n"
                right : "\n\\end{quote}\n"
        subscript :
            wrap :
                left  : '_{'
                right : '}'
        superscript :
            wrap :
                left  : '^{'
                right : '}'
        comment :
            wrap :      # TODO: multi-line
                left  : '% '
                right : ''
        horizontalRule:
            wrap:
                left  : "\\hrulefill"
                #left  : "\n\\noindent\\makebox[\\linewidth]{\\rule{\\paperwidth}{0.4pt}}\n"
                right : ""

    md :
        bold :
            wrap :
                left  : '**'
                right : '**'
        italic :
            wrap :
                left  : '_'
                right : '_'
        underline :
            wrap :
                left  : '<u>'
                right : '</u>'
        strikethrough :
            wrap :
                left  : '~~'
                right : '~~'
        insertunorderedlist :
            wrap :
                left  : "\n - "
                right : "\n"
        insertorderedlist :
            wrap :
                left  : "\n 1. "
                right : "\n"
        format_heading_1 :  # todo -- define via for loop below
            strip : ['format_heading_2','format_heading_3','format_heading_4']
            wrap :
                left  : "\n# "
                right : ""
        format_heading_2 :
            strip : ['format_heading_1','format_heading_3','format_heading_4']
            wrap :
                left  : "\n## "
                right : ""
        format_heading_3 :
            strip : ['format_heading_1','format_heading_2','format_heading_4']
            wrap :
                left  : "\n### "
                right : ""
        format_heading_4 :
            strip : ['format_heading_1','format_heading_2','format_heading_3']
            wrap :
                left  : "\n#### "
                right : ""
        format_code :  # TODO: I think indentation is probably nicer?  on single line ` is nicer.
            wrap :
                left  : '\n```'
                right : '\n```\n'
        indent :
            wrap :
                left  : "\n> "
                right : ""
        horizontalRule:
            wrap:
                left  : "\n------------------\n"
                right : ""
        table :
            wrap:
                left : """
                       | Left-Aligned  | Center Aligned  | Right Aligned |
                       | :------------ |:---------------:| -----:|
                       | col 3 is      | some wordy text | 1600 |
                       | col 2 is      | centered        |  12 |
                       | zebra stripes | and math       |  $\\pi^3$ |
                       """
                right : ""

    html:
        italic :
            wrap :
                left  : '<em>'
                right : '</em>'
        bold :
            wrap :
                left  : '<strong>'
                right : '</strong>'
        underline :
            wrap :
                left  : '<u>'
                right : '</u>'
        strikethrough :
            wrap :
                left  : '<strike>'
                right : '</strike>'
        subscript :
            wrap :
                left  : '<sub>'
                right : '</sub>'
        superscript :
            wrap :
                left  : '<sup>'
                right : '</sup>'
        comment :
            wrap :
                left  : '<!-- '
                right : ' -->'
        insertunorderedlist :
            wrap :
                left  : "\n<ul>\n    <li> "
                right : "</li>\n</ul>\n"
        insertorderedlist :
            wrap :
                left  : "\n<ol>\n    <li> "
                right : "</li>\n</ol>\n"
        justifyleft :    # todo -- define via for loop below
            strip : ['justifycenter','justifyright','justifyfull']
            wrap :
                left  : ""
                right : ""
        justifycenter :
            strip : ['justifycenter','justifyright','justifyleft']
            wrap :
                left  : "<div align='center'>"
                right : "</div>"
        justifyright :
            strip : ['justifycenter','justifyright','justifyleft']
            wrap :
                left  : "<div align='right'>"
                right : "</div>"
        justifyfull :
            strip : ['justifycenter','justifyright','justifyleft']
            wrap :
                left  : "<div align='justify'>"
                right : "</div>"
        indent :
            wrap :
                left  : "<blockquote>"
                right : "</blockquote>"
        format_heading_1 :  # todo -- define via for loop below
            strip : ['format_heading_2','format_heading_3','format_heading_4']
            wrap :
                left  : "<h1>"
                right : "</h1>"
        format_heading_2 :
            strip : ['format_heading_1','format_heading_3','format_heading_4']
            wrap :
                left  : "<h2>"
                right : "</h2>"
        format_heading_3 :
            strip : ['format_heading_1','format_heading_2','format_heading_4']
            wrap :
                left  : "<h3>"
                right : "</h3>"
        format_heading_4 :
            strip : ['format_heading_1','format_heading_2','format_heading_3']
            wrap :
                left  : "<h4>"
                right : "</h4>"
        format_code :
            wrap :
                left  : '<pre>'
                right : '</pre>'
        equation :
            wrap :
                left  : "$ "
                right : " $"
        display_equation :
            wrap :
                left  : "$$ "
                right : " $$"
        table:
            wrap:
                left  : """
                        <table>
                            <tr>
                                <th>Header 1</th>
                                <th>Header 2</th>
                            </tr>
                            <tr>
                                <td>Cell 1</td>
                                <td>Cell 2</td>
                            </tr>
                            <tr>
                                <td>Cell 3</td>
                                <td>Cell 4</td>
                            </tr>
                        </table>
                        """
                right : "\n"
        horizontalRule:
            wrap:
                left  : "\n<hr size='1'/>\n"
                right : ""

    rst:
        # there is intentionally no underline or strikethough in rst
        italic :
            wrap :
                left  : '*'
                right : '*'
        bold :
            wrap :
                left  : '**'
                right : '**'
        subscript :
            wrap :
                left  : ' :sub:`'
                right : '` '
        superscript :
            wrap :
                left  : ' :sup:`'
                right : '` '
        comment :
            wrap :
                left  : '\n.. '
                right : ''
        insertunorderedlist :
            wrap :
                left  : "\n  - "
                right : ""
        insertorderedlist :
            wrap :
                left  : "\n  1. "
                right : ""
        justifyleft :    # todo -- define via for loop below
            strip : ['justifycenter','justifyright','justifyfull']
            wrap :
                left  : ""
                right : ""
        justifycenter :
            strip : ['justifycenter','justifyright','justifyleft']
            wrap :
                left  : "\n.. class:: center\n\n"
                right : ""
        justifyright :
            strip : ['justifycenter','justifyright','justifyleft']
            wrap :
                left  : "\n.. class:: right\n\n"
                right : ""
        justifyfull :
            strip : ['justifycenter','justifyright','justifyleft']
            wrap :
                left  : "\n.. class:: justify\n\n"
                right : ""
        indent :
            wrap :
                left  : "\n  "
                right : ""
        format_heading_1 :  # todo -- define via for loop below
            strip : ['format_heading_2','format_heading_3','format_heading_4']
            wrap :
                left  : "\n===============\n"
                right : "\n===============\n"
        format_heading_2 :
            strip : ['format_heading_1','format_heading_3','format_heading_4']
            wrap :
                left  : "\n---------------\n"
                right : "\n---------------\n"
        format_heading_3 :
            strip : ['format_heading_1','format_heading_2','format_heading_4']
            wrap :
                left  : "\n"
                right : "\n=============\n"
        format_heading_4 :
            strip : ['format_heading_1','format_heading_2','format_heading_3']
            wrap :
                left  : "\n"
                right : "\n-------------\n"
        format_code :
            wrap :
                left  : """
                        .. code:: python

                            def f(x):
                                return 2*x
                        """
                right : '\n'
        equation :
            wrap :
                left  : " :math:`"
                right : "` "
        display_equation :
            wrap :
                left  : "\n.. math::\n\n    "
                right : "\n"
        table: # the first is the more complex grid table, the second one is a "simple" table
                insert: """
                        +------------+------------+-----------+
                        | Header 1   | Header 2   | Header 3  |
                        +============+============+===========+
                        | body row 1 | column 2   | column 3  |
                        +------------+------------+-----------+
                        | body row 2 | Cells may span columns.|
                        +------------+------------+-----------+
                        | body row 3 | Cells may  | - Cells   |
                        +------------+ span rows. | - contain |
                        | body row 4 |            | - blocks. |
                        +------------+------------+-----------+

                        """
                        ###
                        insert: """
                                =====  =====  ======
                                   Inputs     Output
                                ------------  ------
                                  A      B    A or B
                                =====  =====  ======
                                False  False  False
                                True   False  True
                                False  True   True
                                True   True   True
                                =====  =====  ======
                                """
                        ###
        horizontalRule:
             insert : "\n------------------\n"


    mediawiki : # https://www.mediawiki.org/wiki/Help:Formatting
        bold :
            wrap :
                left  : "'''"
                right : "'''"
        italic :
            wrap :
                left  : "''"
                right : "''"
        underline :
            wrap :
                left  : '<u>'
                right : '</u>'
        strikethrough :
            wrap :
                left  : '<strike>'
                right : '</strike>'
        insertunorderedlist :
            wrap :
                left  : "\n* item1\n* item2\n* "
                right : "\n"
        insertorderedlist :
            wrap :
                left  : "\n# one\n# two\n# "
                right : "\n"
        comment :
            wrap :
                left  : '\n<!-- '
                right : ' -->\n'
        indent: # pre tag is more for code, but makes more sense than a dysfunctional ":"
            wrap:
                left  : "\n<pre>"
                right : "</pre>\n"
        format_heading_1 :  # todo -- define via for loop below
            strip : ['format_heading_2','format_heading_3','format_heading_4']
            wrap :
                left  : "\n== "
                right : " ==\n"
        format_heading_2 :
            strip : ['format_heading_1','format_heading_3','format_heading_4']
            wrap :
                left  : "\n=== "
                right : " ===\n"
        format_heading_3 :
            strip : ['format_heading_1','format_heading_2','format_heading_4']
            wrap :
                left  : "\n==== "
                right : " ====\n"
        format_heading_4 :
            strip : ['format_heading_1','format_heading_2','format_heading_3']
            wrap :
                left  : "\n===== "
                right : " =====\n"
        format_code :
            wrap :
                left  : ' <code>'
                right : '</code> '
        horizontalRule:
            wrap:
                left  : "\n----\n"
                right : ""
        table: # https://www.mediawiki.org/wiki/Help:Tables
                insert: """\n
                        {| class="table"
                        |+Table Caption
                        ! Column 1
                        ! Column 2
                        |-
                        |Integral
                        |Derivative
                        |-
                        |Sin
                        |Cos
                        |-
                        |Tan
                        |Sec
                        |}
                        """

    python:
        comment :
            wrap :
                left  : '# '
                right : ''
        len :
            insert : "len([1, 2, 5, 6, 10])"
        list :
            insert : "[1, 2, 5, 6, 10]"
        list_comprehension :
            insert : "[n+1 for n in range(10) if n%2==0]"
        dict :
            insert : "{'sage':'math', 3:7}"
        set :
            insert : "{7, 3, 2}"
        tuple :
            insert : "(2, 3, 7)"
        forloop :
            insert: '\nfor i in range(5):\n    print i\n'
        forlistloop:
            insert: """
                        l = [1, 2, 5, 8, 10]
                        for i in l:
                            print i
                        """
        forelseloop:
            insert: """
                        for k in [1, 2, 5, 10]:
                            if k == 3:
                                print "found k, returning"
                                break
                        else:
                            print "Haven't found k == 3"
                        """
        whileloop:
            insert: """
                        n = 0
                        while n < 5:
                            print n
                            n += 1
                        """
        "if":
            insert: "\nif i == 1:\n    print 'i equals 1'\n"
        ifelse:
            insert: "\nif i == 1:\n    print 'i equals 1'\nelse:\n    print 'i is not 1'\n"
        cases:
            insert: """
                        if i == 0:
                            print "i is zero"
                        elif i == 1:
                            print "i is one"
                        else:
                            print "i is neither zero or one"
                        """
        function:
            insert: """
                        def f(a, b=0):
                            \"\"\"
                            This function returns the sum of a and b.
                            \"\"\"
                            return a + b
                        """
        lambda :
            insert: """f = lambda a, b: a + b"""
        simple_class :
            insert: """
                        class MyClass(object):
                            \"\"\"
                            This is a simple class.
                            \"\"\"
                            def __init__(self, a):
                                self.a = a
                            def __repr__(self):
                                return "Instance of MyClass with a = %s"%self.a

                        print(MyClass(5))
                        """
        class_inheritence :
            insert: """
                        class A(object):
                            def __repr__(self):
                                return "instance of A"
                            def foo(self):
                                return "foo"

                        class B(object):
                            def __repr__(self):
                                return "instance of B"
                            def bar(self):
                                return "bar"

                        class C(A, B):
                            \"\"\"
                            This is a class that inerits from classes A and B.
                            \"\"\"
                            def __repr__(self):
                                return "instance of C"

                        # Both foo and bar are defined on instances of C.
                        c = C()
                        print(c.foo(), c.bar())
                        """
    cython:
        cython_class :
            insert: """
                        cdef class MyClass:
                            \"\"\"
                            This is a Cython class.
                            \"\"\"
                            cdef int a
                            def __init__(self, int a):
                                self.a = a
                            def __repr__(self):
                                return "Instance of MyClass with a = %s"%self.a

                        print(MyClass(5))
                        """
    sage:
        help:
            wrap:
                left  : "help("
                right : ")"
        differentiate:
            insert : 'diff(1 + x + x^2, x)'
        integrate:
            insert : 'integrate(1 + x + x^2, x)'
        nintegrate:
            insert : 'numerical_integral(1 + x + x^2, 0, 3)[0]  # [1] gives error bound'
        symbolic_function:
            insert : 'f(x,y) = x * sin(y)'
        matrix:
            insert : "matrix(2, 3, [1,pi,3, e,5,6])"
        vector:
            insert : "vector([pi, 2, 3, e])"
        plot2d:
            insert : "plot(x * sin(x), (x, -2, 10))"
        plot_line:
            insert : "line([(0,0), (1,2), (1/2,pi), (1/2,pi/2)], color='darkgreen', thickness=3)"
        plot_polygon:
            insert : """
                     a = polygon2d([(0,0), (1,2), (1/2,pi), (1/2,pi/2)], color='orange')
                     b = polygon2d([(0,0), (1,2), (1/2,pi), (1/2,pi/2)], color='black', fill=False, thickness=3)
                     show(a + b)
                     """
        plot_random_walk:
            insert : "stats.TimeSeries(1000).randomize('normal').sums().plot()"
        plot_text:
            insert : 'text("Text and LaTeX: $\\alpha^3 + 1$", (1,1), color="black", fontsize=15, rotation=30)'
        plot_points:
            insert : "show(points([(1,0), (sqrt(2)/2,sqrt(2)/2), (0,1), (1/2,1/2)], color='darkgreen', pointsize=50), aspect_ratio=1)"
        plot3d:
            insert : "\n%var x y\nplot3d(x * sin(y), (x, -5, 5), (y, -5, 5))"
        plot_torus:
            insert : """
                    from sage.plot.plot3d.shapes import Torus
                    inner_radius = .3; outer_radius = 1
                    show(Torus(outer_radius, inner_radius, color='orange'), aspect_ratio=1, spin=3)
                    """
        parametric_curve3d:
            insert : """
                    %var u
                    parametric_plot3d( (sin(u), cos(u), u/10), (u, 0, 20), thickness=5, color='green', plot_points=100)
                    """
        parametric_surface:
            insert : """
                    %var u, v
                    fx = (3*(1+sin(v)) + 2*(1-cos(v)/2)*cos(u))*cos(v)
                    fy = (4+2*(1-cos(v)/2)*cos(u))*sin(v)
                    fz = -2*(1-cos(v)/2) * sin(u)
                    parametric_plot3d([fx, fy, fz], (u, 0, 2*pi), (v, 0, 2*pi), color="green", opacity=.7, mesh=1, spin=5)
                    """
        implicit_plot3d:
            insert : """
                    %var x y z
                    g = golden_ratio; r = 4.77
                    p = 2 - (cos(x + g*y) + cos(x - g*y) + cos(y + g*z) +
                             cos(y - g*z) + cos(z - g*x) + cos(z + g*x))
                    show(implicit_plot3d(p, (x, -r, r), (y, -r, r), (z, -r, r),
                                    plot_points=30, color='orange', mesh=1, opacity=.7), spin=1)
                    """
        icosahedron :
            insert : "show(icosahedron(color='green', opacity=.5, mesh=3), spin=1)"
        cube :
            insert : """
                        show(cube(color=['red', 'blue', 'green'], frame_thickness=2,
                                  frame_color='brown', opacity=0.8), frame=False)
                    """
        plot_text3d:
            insert : 'text3d("Text in 3D", (1,1, 1), color="darkred", fontsize=20)'
        graphs:
            insert : "# Press the TAB key after 'graphs.' to see a list of predefined graphs.\ngraphs."
        petersen:
            insert : "G = graphs.PetersenGraph()\nG.plot()"
        factor:
            insert : "factor(2015)"
        primes:
            insert : "prime_range(100)"
        mod:
            insert : "Mod(5, 12)"
        contfrac:
            insert : "continued_fraction(e)"
        binary_quadform:
            insert : "BinaryQF([1,2,3])"
        ellcurve:
            insert : "EllipticCurve([1,2,3,4,5])"
        var:
            insert : "%var x, theta"
        det:
            insert : "matrix(2, 2, [1,2, 3,4]).det()"
        charpoly:
            insert : "matrix(2, 2, [1,2, 3,4]).charpoly()"
        eigen:
            insert : "matrix(3,[1,2,3, 4,5,6, 7,8,9]).right_eigenvectors()"
        svd:
            insert : "matrix(CDF, 3, [1,2,3, 4,5,6, 7,8,9]).SVD()"
        numpy_array:
            insert : "import numpy\nnumpy.array([[1,2,3], [4,5,6]], dtype=float)"

    r:
        comment:
            wrap:
                left  : "# "
        vector:
            insert : "v <- c(1,1,2,3,5,8,13)"
        forloop:
            wrap:
                left  : """
                        for (i in seq(1, 10, by=2)) {
                            print(sprintf("i = %s", i));
                        """
                right : "\n}\n"
        summary:
            wrap:
                left  : "summary("
                right : ")"
        plot:
            insert : "\nplot(c(1,2,4,8,16,32,64), c(1,1,2,3,5,8,13), type=\"l\")"


#
# programmatically creating the menu entries and buttons
#

#
# helper functions
#

make_bar = (cls) ->
    cls ?= ""
    return $("<span class='btn-group #{cls}'></span>")

# this adds the content of a dropdown menu (basically, single or triple entries)
add_menu = (bar, entries) ->
    dropdown = $("<span class='btn-group'></span>")
    dropdown.append($("""
    <span class="btn btn-default dropdown-toggle" data-toggle="dropdown" title="#{entries[1]}">
     <i class="fa">#{entries[0]}</i> <b class="caret"></b>
    </span>
    """))

    droplist = $("<ul class='dropdown-menu'></ul>")
    divider = """<li class="divider"></li>"""
    first = true
    for item in entries[2]
        if item.length == 1 # new divider
            # don't show dividing line if it is at the very top
            d = if first then '' else divider
            d += """<li role="presentation" class="dropdown-header">#{item[0]}</li>"""
            e = $(d)
        else if item.length in [2, 3] # item in the menu
            help = ""
            if item.length == 3 and item[2].length > 0
                help = "data-toggle='tooltip' data-placement='right' title='#{item[2]}'"
            e = $("<li><a href='#{item[1]}' #{help}>#{item[0]}</a></li>")
        first = false
        droplist.append(e)

    dropdown.append(droplist)
    bar.append(dropdown)

# this adds a single icon to the bar
add_icon = (bar, inner, href, comment) ->
    help = ""
    if comment.length > 0
        help = "data-toggle='tooltip' data-placement='bottom' title='#{comment}'"
    icon = $("<a href='#{href}' class='btn btn-default' #{help}></a>")
    icon.html(inner)
    bar.append(icon)

#
# initializing and creating the menus
# this works in conjuntion with editor.html
#

# Initialize fonts for the editor
initialize_sagews_editor = () ->
    bar = $(".salvus-editor-codemirror-worksheet-editable-buttons")
    elt = bar.find(".sagews-output-editor-font").find(".dropdown-menu")
    for font in 'Serif,Sans,Arial,Arial Black,Courier,Courier New,Comic Sans MS,Georgia,Helvetica,Impact,Lucida Grande,Lucida Sans,Monaco,Palatino,Tahoma,Times New Roman,Verdana'.split(',')
        item = $("<li><a href='#fontName' data-args='#{font}'>#{font}</a></li>")
        item.css('font-family', font)
        elt.append(item)

    elt = bar.find(".sagews-output-editor-font-size").find(".dropdown-menu")
    for size in [1..7]
        item = $("<li><a href='#fontSize' data-args='#{size}'><font size=#{size}>Size #{size}</font></a></li>")
        elt.append(item)

    elt = bar.find(".sagews-output-editor-block-type").find(".dropdown-menu")
    for i in [1..6]
        item = $("<li><a href='#formatBlock' data-args='<H#{i}>'><H#{i} style='margin:0'>Heading</H#{i}></a></li>")
        elt.append(item)

    elt.prepend('<li role="presentation" class="divider"></li>')

    # trick so that data is retained even when editor is cloned:
    args = JSON.stringify([null, {normalize: true, elementTagName:'code', applyToEditableOnly:true}])
    item = $("<li><a href='#ClassApplier' data-args='#{args}'><i class='fa fa-code'></i> <code>Code</code></a></li>")
    elt.prepend(item)

    elt.prepend('<li role="presentation" class="divider"></li>')
    item = $("<li><a href='#removeFormat'><i class='fa fa-remove'></i>
Normal</a></li>")
    elt.prepend(item)

initialize_sagews_editor()



# Initialize fonts for the editor
initialize_md_html_editor = () ->
    bar = $(".salvus-editor-textedit-buttonbar")
    elt = bar.find(".sagews-output-editor-font-face").find(".dropdown-menu")
    for font in FONT_FACES
        item = $("<li><a href='#font_face' data-args='#{font}'>#{font}</a></li>")
        item.css('font-family', font)
        elt.append(item)

    elt = bar.find(".sagews-output-editor-font-size").find(".dropdown-menu")
    v = [1..7]
    v.reverse()
    for size in v
        item = $("<li><a href='#font_size' data-args='#{size}'><font size=#{size}>Size #{size} #{if size==3 then 'default' else ''}</font></a></li>")
        elt.append(item)

    elt = bar.find(".sagews-output-editor-block-type").find(".dropdown-menu")
    for i in [1..4]
        elt.append($("<li><a href='#format_heading_#{i}'><H#{i} style='margin:0'>Heading #{i}</H#{i}></a></li>"))
    elt.append('<li role="presentation" class="divider"></li>')
    elt.append($("<li><a href='#format_code'><i class='fa fa-code'></i> <code>Code</code></a></li>"))


initialize_md_html_editor()

# adding Python & Sage menu entries programmatically (editing HTML directly is too painful)
# TODO make a general class for menu entries and hence use these functions for all menu entries?
initialize_sage_python_r_toolbar = () ->
    # reference example, TODO delete it
    """
            <span class="btn-group">
                <span class="btn btn-default dropdown-toggle" data-toggle="dropdown" title="Control Structures">
                    <i class="fa">Control</i> <b class="caret"></b>
                </span>
                <ul class="dropdown-menu">
                    <li role="presentation" class="dropdown-header">Loops</li>
                    <li><a href='#forloop' data-toggle="tooltip" data-placement="right" title="Iterate over a range of integers">For-Loop</a></li>
                    <li><a href="#forlistloop">For-Loop over a list</a></li>
                    <li class="divider"></li>
                    <li role="presentation" class="dropdown-header">Decisions</li>
                    <li><a href='#if'>If clause</a></li>
                    <li><a href='#ifelse'>If-else clause</a></li>
                    <li class="divider"></li>
                    <li role="presentation" class="dropdown-header">Advanced</li>
                    <li><a href="#cases">Cases</a></li>
                    <li><a href='#forelseloop'>For-Else Loop</a></li>
                </ul>
            </span>
            <a href='#comment' class='btn btn-default' data-toggle="tooltip" data-placement="bottom" title="Comment selected code"><i class="fa">#</i></a>
        </span>
    """

    codebar  = $(".salvus-editor-codeedit-buttonbar")
    # -- python specific --
    pybar    = make_bar("salvus-editor-codeedit-buttonbar-python")
    add_icon(pybar, "<i class='fa'>#</i>", "#comment", "Comment selected text")

    py_control = ["Data", "Basic Data Types",
           [
            ["Construction"],
            ["Dictionary", "#dict"],
            ["List", "#list"],
            ["List Comprehension", "#list_comprehension"],
            ["Set", "#set"],
            ["Tuple", "#tuple"],
            ["Properties"],
            ["Length", "#len"]
        ]]
    add_menu(pybar, py_control)

    # structured dropdown menu data: button text, title info, list of ["button, "#id", "title help (optional)"]
    py_control = ["Control", "Control Structures",
           [["Loops"],
            ["For-Loop", "#forloop", "Iterate over a range of integers"],
            ["For-Loop over a list", "#forlistloop", "Iterate over a list"],
            ["While loop", "#whileloop", "Loop while a condition holds"],
            ["Decisions"],
            ["If", "#if"],
            ["If-Else", "#ifelse"],
            ["Advanced"],
            ["Cases", "#cases", "Deciding between different cases"],
            ["For-Else Loop", "#forelseloop", "Searching for an item with a fallback."]
        ]]
    add_menu(pybar, py_control)

    py_func = ["Functions", "Define Functions",
           [
            ["Function", "#function", "Define a Python function"],
            ["Lambda", "#lambda", "A Python lambda function"]
        ]]

    add_menu(pybar, py_func)

    py_classes = ["Classes", "Define Classes",
           [
            ["Class", "#simple_class", "Define a simple class"],
            ["Class with inheritence", "#class_inheritence", "A class that inherits from other classes"]
        ]]

    add_menu(pybar, py_classes)
    codebar.append(pybar)

    # -- Cython specific
    cythonbar  = make_bar("salvus-editor-codeedit-buttonbar-cython")
    cython_classes = ["Cython Classes", "Define cdef'd Classes",
           [
            ["cdef Class", "#cython_class", "Define a Cython class"],
           ]
         ]
    add_menu(cythonbar, cython_classes)
    cythonbar.append(cythonbar)

    # -- sage specific --
    sagebar  = make_bar("salvus-editor-codeedit-buttonbar-sage")

    sage_calculus = ["Calculus", "Calculus",
                     [["&part; Differentiate", "#differentiate", "Differentiate a function"],
                      ["&int; Numerical Integral",      "#nintegrate",     "Numerically integrate a function"]
                      ["Symbolic Function",      "#symbolic_function",     "Define a symbolic function"]
                      ["&int; Symbolic Integral",      "#integrate",     "Integrate a function"]
                    ]]
    sage_linalg = ["Linear", "Linear Algebra",
                  [
                    ["Matrix $M$",      "#matrix", "Define a matrix"],
                    ["Vector $\\vec v$",  "#vector", "Define a vector"],
                    ["Functions"]
                    ["Characteristic Polynomial", "#charpoly"]
                    ["Determinant", "#det"]
                    ["Eigenvectors", "#eigen", "Eigenvalues and eigenvectors of matrix"]
                    ["SVD", "#svd", "Singular value decomposition of matrix"]

                    ["Numpy"],
                    ["Array",      "#numpy_array"],
                  ]]
    sage_plotting = ["Plots", "Plotting Graphics",
                     [
                      ["2D Plotting"],
                      ["Function", "#plot2d", "Plot f(x)"],
                      ["Line", "#plot_line", "Sequence of line segments"],
                      ["Points", "#plot_points", "Plot many points"],
                      ["Polygon", "#plot_polygon"],
                      ["Random Walk", "#plot_random_walk", "A random walk"],
                      ["Text", "#plot_text", "Draw text"],

                      ["3D Plotting"],
                      ["Cube", "#cube", "Show a colored cube"]
                      ["Function", "#plot3d", "Plot f(x, y)"],
                      ["Icosahedron", "#icosahedron"]
                      ["Implicit 3D Plot", "#implicit_plot3d", "Create an implicit 3D plot"]
                      ["Tetrahedron", "#tetrahedron"]
                      ["Text", "#plot_text3d", "Draw text"],
                      ["Torus", "#plot_torus"]
                      ["Parametric Curve", "#parametric_curve3d"]
                      ["Parametric Surface", "#parametric_surface"]
                      ["Polytope", "#polytope"]
                    ]]
    sage_graphs = ["Graphs", "Graph Theory",
                  [["graphs.&lt;tab&gt;", "#graphs"],
                   ["Petersen Graph", "#petersen", "Define the Peterson graph"]
                  ]]
    sage_nt = ["Number Theory", "Number Theory",
              [
               ["Binary Quadratic Form", "#binary_quadform", "Define a binary quadratic form"],
               ["Continued Fraction", "#contfrac", "Compute a continued fraction"],
               ["Elliptic Curve", "#ellcurve", "Define an elliptic curve"],
               ["Factor", "#factor", "Factorization of something"],
               ["Mod $n$", "#mod", "Number modulo n"],
               ["Prime Numbers", "#primes", "Enumerate prime numbers"]
              ]]

    sage_rings = ["Rings", "Rings and Fields",
              [
               ["$\\ZZ$ (Integers)", "#ring_ZZ"],
               ["$\\QQ$ (Rational Numbers)", "#ring_QQ"],
               ["$\\RR$ (Real Numbers)", "#ring_RR"],
               ["$\\RDF$ (Double Precision)", "#ring_RDF"],
               ["$\\FF_p$ (Prime Finite Field)", "#ring_FF_p"],
               ["$\\FF_{p^r}$ (Finite Field)", "#ring_FF_pr"],
              ]]

    add_icon(sagebar, "$x$", "#var", "Define a symbolic variable", true)
    add_menu(sagebar, sage_plotting)
    add_menu(sagebar, sage_calculus)
    add_menu(sagebar, sage_linalg)
    add_menu(sagebar, sage_graphs)
    add_menu(sagebar, sage_nt)
    add_menu(sagebar, sage_rings)
    add_icon(sagebar, "<i class='fa fa-question-circle'></i> Help", "#help", "Help")

    codebar.append(sagebar)

    # -- r specific --
    rbar = $(".salvus-editor-redit-buttonbar")

    r_basic = make_bar()
    add_icon(r_basic, "<i class='fa'>#</i>", "#comment", "Comment selected text")
    add_icon(r_basic, "$\\vec v$", "#vector", "Insert a vector")

    r_control = $("<span class='btn-group'></span>")
    r_control_entries = ["Control", "Control Structures",
                        [["For-Loop", "#forloop", "Insert a for loop"]
                        ]]
    add_menu(r_control, r_control_entries)

    r_stats = make_bar()
    r_stats_entries = ["Stats", "Basic Statistical Functions",
                      [["Summary of some object", "#summary"]]
                      ]
    add_menu(r_stats, r_stats_entries)

    r_plot = make_bar()
    r_plot_entries = ["Plots", "Basic Plots",
                     [["Plot x/y pairs", "#plot"]
                     ]]
    add_menu(r_plot, r_plot_entries)

    rbar.append(r_basic)
    rbar.append(r_control)
    rbar.append(r_stats)
    rbar.append(r_plot)

initialize_sage_python_r_toolbar()

initialize_latex_buttonbar = () ->
    latexbar = make_bar()
    add_icon(latexbar, "<i class='fa fa-comment'></i>", "#comment", "Comment selected text")

    templates = ["Templates", "These templates come exclusively on top",
                      [
                        ["Article", "#article"],
                        ["KOMA Script"],
                        ["Article", "#scrartcl"],
                        ["Report", "#scrreprt"]
                      ]]
    add_menu(latexbar, templates)

    # TODO merge this with the usual text formatting toolbar, such that its list of actions is inserted here
    # IDEA: maybe, clicking on the "Format" dropdown shows the cloned formatting toolbar?
    text = ["Format", "Text formatting",
            [
             ["<b>Bold</b>", "#bold"]
            ]]
    add_menu(latexbar, text)

    formulas = ["Formula", "These are some standard formuas",
                [
                 ["$x^2$", "#xsquare"],
                 ["$\\int$", "#integral"],
                 ["Environment"],
                 ["Cases", "#cases"]
               ]]
    add_menu(latexbar, formulas)

    bb = $(".salvus-editor-latex-buttonbar")
    bb.append(latexbar)

initialize_latex_buttonbar()