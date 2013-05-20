︠6cfb9d87-2601-453e-8d28-167ccd3860b2i︠
%hide
%md
# MathJax in Markdown tests
## William Stein

This <https://cloud.sagemath.com> worksheet illustrates some examples from the MathJax site, and
is based on this [Ipython notebook](http://nbviewer.ipython.org/urls/raw.github.com/ipython/ipython/master/examples/notebooks/Typesetting%20Math%20Using%20MathJax.ipynb).


︡0c3f0d3b-1cbe-42a8-867d-9460fc2475d2︡{"html":"<h1>MathJax in Markdown tests</h1>\n\n<h2>William Stein</h2>\n\n<p>This <a href=\"https://cloud.sagemath.com\">https://cloud.sagemath.com</a> worksheet illustrates some examples from the MathJax site, and\nis based on this <a href=\"http://nbviewer.ipython.org/urls/raw.github.com/ipython/ipython/master/examples/notebooks/Typesetting%20Math%20Using%20MathJax.ipynb\">Ipython notebook</a>.</p>\n"}︡
︠04f3fdb5-ad61-4001-b5a1-ca0d7d75a76a︠
%md
# xypic looks great
$$
\begin{xy}
\xymatrix{
T \ar@/_/[ddr]_y \ar@/^/[drr]^x \ar@{.>}[dr]|-{(x,y)}\\\\     % NOTE! it's \\\\ instead of \\ here because of markdown.
&X \times_Z Y \ar[d]^q \ar[r]_p & X\ar[d]_f \\\\
&Y \ar[r]^g &Z}
\end{xy}
$$

︡824ff023-31ed-45b8-962e-1b522e2d54b5︡{"html":"<h1>xypic looks great</h1>\n\n<p>$$\\begin{xy}\n\\xymatrix{\nT \\ar@/_/[ddr]_y \\ar@/^/[drr]^x \\ar@{.&gt;}[dr]|-{(x,y)}\\\\     % NOTE! it&#8217;s \\\\ instead of \\ here because of markdown.\n&amp;X \\times_Z Y \\ar[d]^q \\ar[r]_p &amp; X\\ar[d]_f \\\\\n&amp;Y \\ar[r]^g &amp;Z}\n\\end{xy}\n$$</p>\n"}︡
︠b8b0da05-9293-45b6-9839-9e0c76d54459︠
%md
### AMScd is new in Mathjax 2.2; it doesn't look so good below though
\begin{equation}
\begin{CD}
S^{{\mathcal{W}}_\Lambda}\otimes T @>j>> T\\
@VVV @VV{{\rm End} P}V\\
(S\otimes T)/I @= (Z\otimes T)/J
\end{CD}
\end{equation}
︡3c8bf4fc-b1f4-417d-9480-904db429c0d4︡{"html":"<h3>AMScd is new in Mathjax 2.2; it doesn&#8217;t look so good below though</h3>\n\n<p>\\begin{equation}\n\\begin{CD}\nS^{{\\mathcal{W}}_\\Lambda}\\otimes T @>j>> T\\\\\n@VVV @VV{{\\rm End} P}V\\\\\n(S\\otimes T)/I @= (Z\\otimes T)/J\n\\end{CD}\n\\end{equation}</p>\n"}︡
︠5782a63e-0317-420b-a234-e4d9631fcbae︠
%md
\begin{align}
\dot{x} & = \sigma(y-x) \\
\dot{y} & = \rho x - y - xz \\
\dot{z} & = -\beta z + xy
\end{align}
︡745af107-5ef5-4491-a883-363e88573e00︡{"html":"<p>\\begin{align}\n\\dot{x} & = \\sigma(y-x) \\\\\n\\dot{y} & = \\rho x - y - xz \\\\\n\\dot{z} & = -\\beta z + xy\n\\end{align}</p>\n"}︡
︠1eb51d48-514a-4a23-b89b-22827eb0c38b︠
%md
\begin{equation*}
\left( \sum_{k=1}^n a_k b_k \right)^2 \leq \left( \sum_{k=1}^n a_k^2 \right) \left( \sum_{k=1}^n b_k^2 \right)
\end{equation*}
︡af30f774-20cb-47b4-8042-4b561a2f7db2︡{"html":"<p>\\begin{equation*}\n\\left( \\sum_{k=1}^n a_k b_k \\right)^2 \\leq \\left( \\sum_{k=1}^n a_k^2 \\right) \\left( \\sum_{k=1}^n b_k^2 \\right)\n\\end{equation*}</p>\n"}︡
︠60a3d31a-9ef3-4017-ae8a-66121c95cd6b︠
%md
\begin{equation*}
\mathbf{V}_1 \times \mathbf{V}_2 =  \begin{vmatrix}
\mathbf{i} & \mathbf{j} & \mathbf{k} \\
\frac{\partial X}{\partial u} &  \frac{\partial Y}{\partial u} & 0 \\
\frac{\partial X}{\partial v} &  \frac{\partial Y}{\partial v} & 0
\end{vmatrix}
\end{equation*}
︡7e39661b-0ccc-4243-94f6-29401f0f713b︡{"html":"<p>\\begin{equation*}\n\\mathbf{V}_1 \\times \\mathbf{V}_2 =  \\begin{vmatrix}\n\\mathbf{i} & \\mathbf{j} & \\mathbf{k} \\\\\n\\frac{\\partial X}{\\partial u} &  \\frac{\\partial Y}{\\partial u} & 0 \\\\\n\\frac{\\partial X}{\\partial v} &  \\frac{\\partial Y}{\\partial v} & 0\n\\end{vmatrix}\n\\end{equation*}</p>\n"}︡
︠bd7ac1be-c2d9-4c71-8d99-0902ff550aa8︠
%md
\begin{equation*}
P(E)   = {n \choose k} p^k (1-p)^{ n-k}
\end{equation*}
︡65396dd5-6bd4-45ee-b607-ed50f426656a︡{"html":"<p>\\begin{equation*}\nP(E)   = {n \\choose k} p^k (1-p)^{ n-k}\n\\end{equation*}</p>\n"}︡
︠dffcd087-f14b-443e-905a-110364e09d66︠
%md
\begin{equation*}
\frac{1}{\Bigl(\sqrt{\phi \sqrt{5}}-\phi\Bigr) e^{\frac25 \pi}} =
1+\frac{e^{-2\pi}} {1+\frac{e^{-4\pi}} {1+\frac{e^{-6\pi}}
{1+\frac{e^{-8\pi}} {1+\ldots} } } }
\end{equation*}
︡65128d83-a964-4352-b3e4-fc040a2037e4︡{"html":"<p>\\begin{equation*}\n\\frac{1}{\\Bigl(\\sqrt{\\phi \\sqrt{5}}-\\phi\\Bigr) e^{\\frac25 \\pi}} =\n1+\\frac{e^{-2\\pi}} {1+\\frac{e^{-4\\pi}} {1+\\frac{e^{-6\\pi}}\n{1+\\frac{e^{-8\\pi}} {1+\\ldots} } } }\n\\end{equation*}</p>\n"}︡
︠e4b7a67a-0fed-4d62-b31e-6ef26c2f5b50︠
%md
\begin{equation*}
1 +  \frac{q^2}{(1-q)}+\frac{q^6}{(1-q)(1-q^2)}+\cdots =
\prod_{j=0}^{\infty}\frac{1}{(1-q^{5j+2})(1-q^{5j+3})},
\quad\quad \text{for $|q|<1$}.
\end{equation*}
︡164ce3c0-6bc6-4ee1-92f6-8d228fa7ac8a︡{"html":"<p>\\begin{equation*}\n1 +  \\frac{q^2}{(1-q)}+\\frac{q^6}{(1-q)(1-q^2)}+\\cdots =\n\\prod_{j=0}^{\\infty}\\frac{1}{(1-q^{5j+2})(1-q^{5j+3})},\n\\quad\\quad \\text{for $|q|<1$}.\n\\end{equation*}</p>\n"}︡
︠1c969f0f-75f8-45a7-8063-e5328ef44c9d︠
%latex
$$\begin{aligned}
\nabla \times \vec{\mathbf{B}} -\, \frac1c\, \frac{\partial\vec{\mathbf{E}}}{\partial t} & = \frac{4\pi}{c}\vec{\mathbf{j}} \\   \nabla \cdot \vec{\mathbf{E}} & = 4 \pi \rho \\
\nabla \times \vec{\mathbf{E}}\, +\, \frac1c\, \frac{\partial\vec{\mathbf{B}}}{\partial t} & = \vec{\mathbf{0}} \\
\nabla \cdot \vec{\mathbf{B}} & = 0
\end{aligned}$$
︡db58a9d4-9bca-421a-a6bb-7a53e31999bd︡{"once":false,"file":{"show":true,"uuid":"8cad95a6-8fe2-4cc0-a3dc-8f909a134c25","filename":"/tmp/tmpXGo5jr.png"}}︡
︠97eee63a-d250-4a50-a770-d4f86f3f6fd4︠
%md

\begin{align}
\nabla \times \vec{\mathbf{B}} -\, \frac1c\, \frac{\partial\vec{\mathbf{E}}}{\partial t} & = \frac{4\pi}{c}\vec{\mathbf{j}} \\   \nabla \cdot \vec{\mathbf{E}} & = 4 \pi \rho \\
\nabla \times \vec{\mathbf{E}}\, +\, \frac1c\, \frac{\partial\vec{\mathbf{B}}}{\partial t} & = \vec{\mathbf{0}} \\
\nabla \cdot \vec{\mathbf{B}} & = 0
\end{align}

︡999202d5-86c3-409f-afda-f95146d57348︡{"html":"<p>\\begin{align}\n\\nabla \\times \\vec{\\mathbf{B}} -\\, \\frac1c\\, \\frac{\\partial\\vec{\\mathbf{E}}}{\\partial t} & = \\frac{4\\pi}{c}\\vec{\\mathbf{j}} \\\\   \\nabla \\cdot \\vec{\\mathbf{E}} & = 4 \\pi \\rho \\\\\n\\nabla \\times \\vec{\\mathbf{E}}\\, +\\, \\frac1c\\, \\frac{\\partial\\vec{\\mathbf{B}}}{\\partial t} & = \\vec{\\mathbf{0}} \\\\\n\\nabla \\cdot \\vec{\\mathbf{B}} & = 0\n\\end{align}</p>\n"}︡
︠32042f64-c447-4f0e-b14e-7c30167ebc41︠
%md
This expression $\sqrt{3x-1}+(1+x)^2$ is an example of a TeX inline equation in a **[Markdown-formatted](http://daringfireball.net/projects/markdown/)** sentence.
︡dd6cafed-38bf-4716-a08f-8710e881da22︡{"html":"<p>This expression $\\sqrt{3x-1}+(1+x)^2$ is an example of a TeX inline equation in a <strong><a href=\"http://daringfireball.net/projects/markdown/\">Markdown-formatted</a></strong> sentence.</p>\n"}︡
︠31d553e4-dccf-4edf-b51b-5d0dd3934f11︠
%md
$$
\begin{array}{c}
y_1 \\\
y_2 \mathtt{t}_i \\\
z_{3,4}
\end{array}
$$
$$
\begin{array}{c}
y_1 \cr
y_2 \mathtt{t}_i \cr
y_{3}
\end{array}
$$
︡c57560d0-b61b-4b53-8bef-deccd9708206︡{"html":"<p>$$\n\\begin{array}{c}\ny_1 \\\\\ny_2 \\mathtt{t}_i \\\\\nz_{3,4}\n\\end{array}\n$$\n$$\n\\begin{array}{c}\ny_1 \\cr\ny_2 \\mathtt{t}_i \\cr\ny_{3}\n\\end{array}\n$$</p>\n"}︡
︠15d4a90a-0bd0-4ddd-9d26-f8bb0fb1357c︠
%md

\begin{eqnarray}
x' &=& &x \sin\phi &+& z \cos\phi \\
z' &=& - &x \cos\phi &+& z \sin\phi \\
\end{eqnarray}

︡ba7c401b-373f-45d9-b0e4-5db5d8e89275︡{"html":"<p>\\begin{eqnarray}\nx' &=& &x \\sin\\phi &+& z \\cos\\phi \\\\\nz' &=& - &x \\cos\\phi &+& z \\sin\\phi \\\\\n\\end{eqnarray}</p>\n"}︡
︠1caba641-26ef-4b5d-b6ea-fb06d7130994︠






