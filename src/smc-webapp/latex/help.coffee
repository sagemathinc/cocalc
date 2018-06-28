# This file contains embedded help texts for the LaTeX editor

{redux} = require('../app-framework')
{SITE_NAME} = require('smc-util/theme')
SiteName = redux.getStore('customize').site_name ? SITE_NAME

# This is currently the only text. It is displayed in a dedicated "help" tab on the right hand side.
# TODO: expand a bit the FAQ, maybe link to the WIKI, ...
exports.help_md = """
# LaTeX Editor Help

LaTeX is a sophisticated markup language and processor for typesetting documents.
For a general introduction, read this [LaTeX wiki book](https://en.wikibooks.org/wiki/LaTeX) or any other resource.
In general, it works by editing source code, visible on the left, and compiling it to a PDF document,
visible on the right.
#{SiteName} manages this task for you, by regularly saving and running the LaTeX processor for you.

On the right-hand side there are several tabs like this one here for help:

* **Preview** quickly renders a few pages to see how the current part of the document looks.
  * You can easily position the preview by hold-clicking and moving the mouse inside the shown preview.
  * The first four buttons at the top are for zooming (our or in, zoom out to full width, and centered to the content of the page).
  * The next button is for the resolution of the preview: smaller numbers load more quickly, while you see less details.
  * The last button is for downloading the PDF.
* **Issues** lists all compilation warnings and errors.
  Click on the buttons to jump to the corresponding line in the input code on the left.
  _**LaTeX won't compile** (or only partially or in a wrong way) **as long as there are any errors left!**_
* **PDF** shows you an embedded view of the compiled PDF file.
  This might be broken if your browser has problems rendering the file inline –
  use the "Preview" tab instead!
* **Build** gives you advanced control over how the compilation process works:
  * **Rebuild**: erases all temporary documents and starts the compilation from scratch
  * **Latex**: triggers a "normal" Latex build, which is much faster since temporary files are retained
  * **Bibtex**: explicitly runs [Bibtex](https://en.wikipedia.org/wiki/BibTeX), usually managed by the build process
  * **Sage**: runs "SageMath" for [SageTeX](https://www.ctan.org/pkg/sagetex?lang=en), usually managed by the build process
  * **Clean**: deletes temporary files
  * **Build Command**: The drop-down list on the right hand side lets you specify the compilation program.
    On the left, you can edit the command even further. It is saved as part of the document, at the bottom.
By default, it runs [LatexMK](https://www.ctan.org/pkg/latexmk/) which manages temporary files and bibtex, and automatically runs SageTeX if necessary.

## Features

### Forward & Inverse Search

Forward and inverse search are extremely helpful for navigating in a larger document.

**Forward**: place your cursor at a specific location in the editor on the left-hand side.
Click the "Forward" button or the `[ALT]`+`[Return]` keyboard shortcut to jump to the corresponding
location in the preview on the right-hand side.
(It might not always work in case the full positional information is not available.)

**Inverse**: Double-click on an area of interest on the right hand side in the **Preview** area.
The cursor on the left-hand side will jump to the paragraph in the source-code.

## Quickstart

It is very easy to start with LaTeX.
#{SiteName} guides your first document with a small default template.
You start working between the `\\begin{document} ... \\end{document}` instructions.
Everything before `\\begin{document}` is called the "preamble" and contains the configuration for the document.

For example, remove the `\\maketitle` instruction and replace it by

> `Hello \\textbf{#{SiteName}}! This is a formula: $\\frac{1}{1+x^2}$.`

After saving (`[CTRL]` + `[s]`), there should be a small spinner next to `Build` and once done,
the preview renders. You should then see:

> Hello **#{SiteName}**! This is a formula: $\\frac{1}{1+x^2}$.

* **New paragraphs**: Single returns for new lines do not have any effect.
  Use them to keep new sentences in paragraphs at the beginning of a line for better overview.
  Two or more returns introduce a new paragraph.
* **Formulas**: They're either between `$` or `$$`, or in `\\begin{equation}...\\end{equation}` environments.

## LaTeX Engines

* **latexmk** + **PDFlatex**: the default configuration, works in most cases
* **latexmk** + **XeLaTeX**: this is useful for foreign languages with many special characters.

## Encoding

**UTF8**: the build process runs in a Linux environment.
All edited documents are assumed to be encoded as UTF-8.
Therefore, depending if you compile via PDFLaTeX or XeLaTeX, the following encoding defintions are the preferred choices:

* PDFLaTeX:
  ```
  \\usepackage[T1]{fontenc}
  \\usepackage[utf8]{inputenc}
  \\usepackage{lmodern}
  ```
* XeLaTeX:
  ```
  \\usepackage{fontspec}
  ```

The default template already selects the correct configuration for you.

## FAQ

### How to insert an image?

1. Upload a PNG or PDF file via #{SiteName}'s "Files" interface.
   The uploaded image should be in the same directory as the `.tex` file
   Otherwise, use relative paths like `./images/filename.png` if it is in a subdirectory `images`.
2. Follow [these instructions](https://en.wikibooks.org/wiki/LaTeX/Floats,_Figures_and_Captions)
   about how to insert a graphic in a figure environment.
   Do not forget `\\usepackage{graphicx}` in the preamble declaration.

### How to insert a backslash or dollar sign?

The `\\` character has a special meaning.
It signals a LaTeX command or is used as an escape character.
To enter a backslash, escape its meaning by entering it twice: `\\\\`.

A dollar sign is entered as `\\$`, which escapes the meaning of "formula-start".

### What to do if the preview does not update

Possible reasons:

1. Are there any errors in the "Issues" tab? LaTeX only compiles well if there are zero reported errors.
2. Long documents could take an extended period of time to complete. In the "Preview" tab, disable the preview and only enable it once to avoid piling up too much work on the back-end.
3. Similarly, computational-heavy "SageTeX" computations could lead to excessive compilation times.
   You can pre-compute results or split the document into smaller parts.

### How to deal with large documents across multiple source files?

The best way is to use the [subfiles](https://www.ctan.org/pkg/subfiles?lang=en) package as [described here](https://en.wikibooks.org/wiki/LaTeX/Modular_Documents#Subfiles).
Here is an extended example demonstrating how this works: [cloud-examples/latex/multiple-files](https://github.com/sagemath/cloud-examples/tree/master/latex/multiple-files).
"""