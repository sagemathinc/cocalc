# CoCalc

[![Make all packages and run their tests](https://github.com/sagemathinc/cocalc/actions/workflows/make-and-test.yml/badge.svg)](https://github.com/sagemathinc/cocalc/actions/workflows/make-and-test.yml)

#### <u>_**Co**_</u>_llaborative_ <u>_**Calc**_</u>_ulation_

CoCalc is web-based software that enables collaboration in research, teaching, and scientific publishing. It includes [Jupyter Notebooks](https://cocalc.com/features/jupyter-notebook), [Sage Worksheets](https://cocalc.com/features/sage), a [LaTeX Editor](https://cocalc.com/features/latex-editor) and a [Linux Terminal](https://cocalc.com/features/terminal) to help people work together in real time from different locations. It also has a [Computational Whiteboard](https://cocalc.com/features/whiteboard) for expressing and sharing ideas and running code. It is available for free and [can be upgraded for internet access, better hosting quality, and other features](https://cocalc.com/store). It can also be used for [teaching courses](https://cocalc.com/features/teaching) with flexible [course license options](https://cocalc.com/pricing/courses). It is also possible to run CoCalc [on your own infrastructure](https://cocalc.com/pricing/onprem).

**CoCalc** supports sophisticated calculations that arise in teaching, research, and authoring documents. This includes working with the full data science and scientific Python stack, [SageMath](https://www.sagemath.org), [Julia](https://julialang.org), [R Statistics](https://cocalc.com/doc/r-statistical-software.html), [Octave](https://www.gnu.org/software/octave/), and much more. It also offers capabilities to author documents in [LaTeX](https://cocalc.com/doc/latex-editor.html), R/knitr and Markdown, storing and organizing files, a web-based [Linux Terminal](https://doc.cocalc.com/terminal.html), an [X11 graphical desktop](https://doc.cocalc.com/x11.html), and communication tools like a [chatrooms](https://doc.cocalc.com/chat.html), [course management](https://cocalc.com/doc/teaching.html) and more. It is the best choice for [teaching remote scientific courses](https://cocalc.com/doc/teaching.html).

## Quick Start

1. Visit https://cocalc.com
2. Sign up for a free account
3. Create a new project
4. Choose a computational environment (e.g., Jupyter Notebook, Sage Worksheet, LaTeX Editor)
5. Start collaborating with others in real-time

## Key Features

- **Jupyter Notebooks**: Interactive Python, R, and Julia environments
- **Sage Worksheets**: Powerful mathematical computations
- **LaTeX Editor**: Collaborative document creation with real-time preview
- **Linux Terminal**: Full command-line access
- **Computational Whiteboard**: Visual collaboration and code execution
- **Course Management**: Tools for teaching and managing classes
- **Real-time Collaboration**: Work together seamlessly on projects
- **Version Control**: Built-in time travel and project history

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

### CoCalc Cloud

CoCalc Cloud runs on Kubernetes and inherits the security and scalability of the SaaS platform. To get started:

1. Visit https://cocalc.com/pricing/onprem for pricing information
2. Contact sales@sagemath.com to discuss deployment options
3. Prepare your Kubernetes cluster
4. Follow the deployment guide at https://doc-cloud.cocalc.com/
5. Configure your instance and start using your self-hosted CoCalc

### CoCalc-Docker (for smaller deployments or personal use)

1. Ensure Docker is installed on your system
2. Visit the CoCalc-Docker repository: https://github.com/sagemathinc/cocalc-docker
3. Follow the installation and usage instructions provided in the repository's README

For more detailed information on self-hosting options, please contact help@sagemath.com.

## History

_CoCalc_ was formerly called _SageMathCloud_.
It started to offer way more than just SageMath and hence outgrew itself.
The name was coined in fall 2016 and changed around spring 2017.

## Contributors

CoCalc is made possible by the hard work of many contributors. Our team includes mathematicians, computer scientists, and software engineers from around the world. Key contributors include:

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

... and others: See https://github.com/sagemathinc/cocalc/graphs/contributors

We welcome new contributions! If you're interested in contributing, please see our Contributing Guidelines (link to be added).

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

The scripts [here](https://github.com/sagemathinc/cocalc/tree/master/src/dev) might be helpful. &nbsp;We do most of our development of CoCalc on https://cocalc.com itself. CoCalc uses pnpm version at least 10.

## Support and Community

- **User Manual**: https://doc.cocalc.com/
- **Mailing List**: https://groups.google.com/forum/#!forum/cocalc
- **Discord Chat**: https://discord.gg/nEHs2GK
- **Bug Reports**: https://github.com/sagemathinc/cocalc/issues
- **Commercial Support**: https://cocalc.com/pricing

## Acknowledgements

### Browserstack

We are grateful to BrowserStack for providing infrastructure to test CoCalc.
<a href="https://www.browserstack.com" target="_blank"><img alt='' src='http://i.imgur.com/VProOTR.png' width=128 height=undefined title=''/></a>

### Google

We thank Google for donating over \$150K in cloud credits since 2014 to support this project.
