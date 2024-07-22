# CoCalc

#### <u>_**Co**_</u>_llaborative_ <u>_**Calc**_</u>_ulation_

CoCalc is web-based software that enables collaboration in research, teaching, and scientific publishing. It includes [Jupyter Notebooks](https://cocalc.com/features/jupyter-notebook), [Sage Worksheets](https://cocalc.com/features/sage), a [LaTeX Editor](https://cocalc.com/features/latex-editor) and a [Linux Terminal](https://cocalc.com/features/terminal) to help people work together in real time from different locations. It also has a [Computational Whiteboard](https://cocalc.com/features/whiteboard) for expressing and sharing ideas and running code. It is available for free and [can be upgraded for internet access, better hosting quality, and other features](https://cocalc.com/store). It can also be used for [teaching courses](https://cocalc.com/features/teaching) with flexible [course license options](https://cocalc.com/pricing/courses). It is also possible to run CoCalc [on your own infrastructure](https://cocalc.com/pricing/onprem).

**CoCalc** supports sophisticated calculations that arise in teaching, research, and authoring documents. This includes working with the full data science and scientific Python stack, [SageMath](https://www.sagemath.org), [Julia](https://julialang.org), [R Statistics](https://cocalc.com/doc/r-statistical-software.html), [Octave](https://www.gnu.org/software/octave/), and much more. It also offers capabilities to author documents in [LaTeX](https://cocalc.com/doc/latex-editor.html), R/knitr and Markdown, storing and organizing files, a web-based [Linux Terminal](https://doc.cocalc.com/terminal.html), an [X11 graphical desktop](https://doc.cocalc.com/x11.html), and communication tools like a [chatrooms](https://doc.cocalc.com/chat.html), [course management](https://cocalc.com/doc/teaching.html) and more.  It is the best choice for [teaching remote scientific courses](https://cocalc.com/doc/teaching.html).

## Website

- [CoCalc](https://cocalc.com/index.html) -- commercial CoCalc hosting and support
- [CoCalc user manual](https://doc.cocalc.com/) -- learn how to use CoCalc
- [Code GitHub repository](https://github.com/sagemathinc/cocalc) -- source code of CoCalc
- [CoCalc-Docker](https://github.com/sagemathinc/cocalc-docker) -- run CoCalc on your own computer (using Docker)
- [CoCalc mailing list](https://groups.google.com/forum/#!forum/cocalc) -- discuss CoCalc via email
- [CoCalc Discord server](https://discord.gg/nEHs2GK) -- chat about CoCalc

## Install CoCalc on your server or computer

You can obtain a packaged version of CoCalc for your own on-premises infrastructure: [**CoCalc Cloud**](https://doc-cloud.cocalc.com/).
It runs on Kubernetes and inherits the security and scalability of the SaaS platform.

## History

_CoCalc_ was formerly called _SageMathCloud_.
It started to offer way more than just SageMath and hence outgrew itself.
The name was coined in fall 2016 and changed around spring 2017.

## Contributors

### YOU?!

New -- Feb 2022:  If you want to work on something at https://github.com/sagemathinc/cocalc/issues, [contact us](email:help@cocalc.com), and we might be able to pay you!

### Contributors

- Greg Bard
- Rob Beezer
- Blaec Bejarano
- Keith Clawson
- Tim Clemans
- Andy Huchala
- John Jeng
- Jon Lee
- Simon Luu
- Andrey Novoseltsev
- Nicholas Ruhland
- Harald Schilly
- Travis Scholl
- Hal Snyder
- William Stein
- Jonathan Thompson
- Todd Zimmerman

... and _many_ others: See https://github.com/sagemathinc/cocalc/graphs/contributors

## Copyright/License

The copyright of CoCalc is owned by SageMath, Inc., and the source code
here is released under the **MICROSOFT REFERENCE SOURCE LICENSE (MS-RSL)**.

See the included file [LICENSE.md](./LICENSE.md) for more details.

None of the frontend or server dependencies of CoCalc are themselves GPL licensed;
they all have non-viral liberal licenses.

To clarify the above in relation to the "reference use":

- you can download the CoCalc source code at your organization
- you are allowed to read the source code and to inspect it
- you are allowed to enhance the interoperability of your product with CoCalc
- you are **not** allowed to compile and run the code

**If want to host your own CoCalc at your organization, please contact [help@sagemath.com](mailto:help@sagemath.com).**
In particular, [CoCalc OnPrem](https://cocalc.com/pricing/onprem) is designed for setting up an instance of CoCalc on-premises.

## Trademark

"CoCalc" is a [registered trademark](http://tsdr.uspto.gov/#caseNumber=87155974&caseType=SERIAL_NO&searchType=statusSearch) of SageMath, Inc.

## Development

The scripts [here](https://github.com/sagemathinc/cocalc/tree/master/src/dev) might be helpful. &nbsp;We do most of our development of CoCalc on https://cocalc.com itself.  CoCalc requires pnpm version at least 9.

## Acknowledgements

### Browserstack

We are grateful to BrowserStack for providing infrastructure to test CoCalc.
<a href="https://www.browserstack.com" target="_blank"><img alt='' src='http://i.imgur.com/VProOTR.png' width=128 height=undefined title=''/></a>

### Google

We thank Google for donating over \$150K in cloud credits since 2014 to support this project.
