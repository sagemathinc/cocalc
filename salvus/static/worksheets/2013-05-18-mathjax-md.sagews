︠6cfb9d87-2601-453e-8d28-167ccd3860b2i︠
%hide
%md
# MathJax in Markdown tests
## William Stein

This <https://cloud.sagemath.com> worksheet illustrates some examples from the MathJax site, and
is based on this [Ipython notebook](http://nbviewer.ipython.org/urls/raw.github.com/ipython/ipython/master/examples/notebooks/Typesetting%20Math%20Using%20MathJax.ipynb).


︡0c3f0d3b-1cbe-42a8-867d-9460fc2475d2︡{"html":"<h1>MathJax in Markdown tests</h1>\n\n<h2>William Stein</h2>\n\n<p>This <a href=\"https://cloud.sagemath.com\">https://cloud.sagemath.com</a> worksheet illustrates some examples from the MathJax site, and\nis based on this <a href=\"http://nbviewer.ipython.org/urls/raw.github.com/ipython/ipython/master/examples/notebooks/Typesetting%20Math%20Using%20MathJax.ipynb\">Ipython notebook</a>.</p>\n"}︡
︠5782a63e-0317-420b-a234-e4d9631fcbae︠
%md
$
\begin{aligned}
\dot{x} & = \sigma(y-x) \\
\dot{y} & = \rho x - y - xz \\
\dot{z} & = -\beta z + xy
\end{aligned}
$
︡c70a9c5d-28b9-49a9-9faf-bcb775f45555︡{"html":"<p>$\n\\begin{aligned}\n\\dot{x} & = \\sigma(y-x) \\\\\n\\dot{y} & = \\rho x - y - xz \\\\\n\\dot{z} & = -\\beta z + xy\n\\end{aligned}\n$</p>\n"}︡
︠1eb51d48-514a-4a23-b89b-22827eb0c38b︠
%md
$
\begin{equation*}
\left( \sum_{k=1}^n a_k b_k \right)^2 \leq \left( \sum_{k=1}^n a_k^2 \right) \left( \sum_{k=1}^n b_k^2 \right)
\end{equation*}
$
︡27bc2e94-0d84-45d1-95de-5591b2104ea9︡{"html":"<p>$\n\\begin{equation*}\n\\left( \\sum_{k=1}^n a_k b_k \\right)^2 \\leq \\left( \\sum_{k=1}^n a_k^2 \\right) \\left( \\sum_{k=1}^n b_k^2 \\right)\n\\end{equation*}\n$</p>\n"}︡
︠60a3d31a-9ef3-4017-ae8a-66121c95cd6b︠
%md
$
\begin{equation*}
\mathbf{V}_1 \times \mathbf{V}_2 =  \begin{vmatrix}
\mathbf{i} & \mathbf{j} & \mathbf{k} \\
\frac{\partial X}{\partial u} &  \frac{\partial Y}{\partial u} & 0 \\
\frac{\partial X}{\partial v} &  \frac{\partial Y}{\partial v} & 0
\end{vmatrix}
\end{equation*}
$
︡51c6b1ff-28ed-4f46-a197-2cf7f2ba4b7e︡{"html":"<p>$\n\\begin{equation*}\n\\mathbf{V}_1 \\times \\mathbf{V}_2 =  \\begin{vmatrix}\n\\mathbf{i} & \\mathbf{j} & \\mathbf{k} \\\\\n\\frac{\\partial X}{\\partial u} &  \\frac{\\partial Y}{\\partial u} & 0 \\\\\n\\frac{\\partial X}{\\partial v} &  \\frac{\\partial Y}{\\partial v} & 0\n\\end{vmatrix}  \n\\end{equation*}\n$</p>\n"}︡
︠bd7ac1be-c2d9-4c71-8d99-0902ff550aa8︠
%md
$
\begin{equation*}
P(E)   = {n \choose k} p^k (1-p)^{ n-k}
\end{equation*}
$
︡f4b3a989-965e-4f24-9a4a-2a1d73c91953︡{"html":"<p>$\n\\begin{equation*}\nP(E)   = {n \\choose k} p^k (1-p)^{ n-k} \n\\end{equation*}\n$</p>\n"}︡
︠dffcd087-f14b-443e-905a-110364e09d66︠
%md
$$\begin{equation*}
\frac{1}{\Bigl(\sqrt{\phi \sqrt{5}}-\phi\Bigr) e^{\frac25 \pi}} =
1+\frac{e^{-2\pi}} {1+\frac{e^{-4\pi}} {1+\frac{e^{-6\pi}}
{1+\frac{e^{-8\pi}} {1+\ldots} } } }
\end{equation*}$$
︡7088da9b-975c-4075-811d-82fbc7ea9e24︡{"html":"<p>$$\\begin{equation*}\n\\frac{1}{\\Bigl(\\sqrt{\\phi \\sqrt{5}}-\\phi\\Bigr) e^{\\frac25 \\pi}} =\n1+\\frac{e^{-2\\pi}} {1+\\frac{e^{-4\\pi}} {1+\\frac{e^{-6\\pi}}\n{1+\\frac{e^{-8\\pi}} {1+\\ldots} } } } \n\\end{equation*}$$</p>\n"}︡
︠e4b7a67a-0fed-4d62-b31e-6ef26c2f5b50︠
%md
$\begin{equation*}
1 +  \frac{q^2}{(1-q)}+\frac{q^6}{(1-q)(1-q^2)}+\cdots =
\prod_{j=0}^{\infty}\frac{1}{(1-q^{5j+2})(1-q^{5j+3})},
\quad\quad \text{for $|q|<1$}.
\end{equation*}$
︡cf06c1a5-422d-492d-bbfc-2af2518ba991︡{"html":"<p>$\\begin{equation*}\n1 +  \\frac{q^2}{(1-q)}+\\frac{q^6}{(1-q)(1-q^2)}+\\cdots =\n\\prod_{j=0}^{\\infty}\\frac{1}{(1-q^{5j+2})(1-q^{5j+3})},\n\\quad\\quad \\text{for $|q|&lt;1$}. \n\\end{equation*}$</p>\n"}︡
︠97eee63a-d250-4a50-a770-d4f86f3f6fd4︠
%md
$
\begin{aligned}
\nabla \times \vec{\mathbf{B}} -\, \frac1c\, \frac{\partial\vec{\mathbf{E}}}{\partial t} & = \frac{4\pi}{c}\vec{\mathbf{j}} \\   \nabla \cdot \vec{\mathbf{E}} & = 4 \pi \rho \\
\nabla \times \vec{\mathbf{E}}\, +\, \frac1c\, \frac{\partial\vec{\mathbf{B}}}{\partial t} & = \vec{\mathbf{0}} \\
\nabla \cdot \vec{\mathbf{B}} & = 0
\end{aligned}$
︡3b90eccb-d57a-4d7c-8d2e-1e0bc8337d88︡{"html":"<p>$\n\\begin{aligned}\n\\nabla \\times \\vec{\\mathbf{B}} -\\, \\frac1c\\, \\frac{\\partial\\vec{\\mathbf{E}}}{\\partial t} & = \\frac{4\\pi}{c}\\vec{\\mathbf{j}} \\\\   \\nabla \\cdot \\vec{\\mathbf{E}} & = 4 \\pi \\rho \\\\\n\\nabla \\times \\vec{\\mathbf{E}}\\, +\\, \\frac1c\\, \\frac{\\partial\\vec{\\mathbf{B}}}{\\partial t} & = \\vec{\\mathbf{0}} \\\\\n\\nabla \\cdot \\vec{\\mathbf{B}} & = 0 \n\\end{aligned}$</p>\n"}︡
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
$$\begin{eqnarray}
x' &=& &x \sin\phi &+& z \cos\phi \\
z' &=& - &x \cos\phi &+& z \sin\phi \\
\end{eqnarray}$$
$$
x=4
$$
︡f85ba158-2e96-4ecb-a9af-b4db3bfab884︡{"html":"<p>$$\n\\begin{array}{c}\ny_1 \\\\\\\ny_2 \\mathtt{t}_i \\\\\\\nz_{3,4}\n\\end{array}\n$$\n$$\n\\begin{array}{c}\ny_1 \\cr\ny_2 \\mathtt{t}_i \\cr\ny_{3}\n\\end{array}\n$$\n$$\\begin{eqnarray} \nx' &=& &x \\sin\\phi &+& z \\cos\\phi \\\\\nz' &=& - &x \\cos\\phi &+& z \\sin\\phi \\\\\n\\end{eqnarray}$$\n$$\nx=4\n$$</p>\n"}︡
︠1caba641-26ef-4b5d-b6ea-fb06d7130994︠






