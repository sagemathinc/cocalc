pdfListView
===========

*This is work in progress.*

A simple list view to render a PDF document using [PDF.JS](https://github.com/mozilla/pdf.js).

# Project Goals

- provide basic functionality to build a viewer around the PDF.JS library
- while this library provides the founcation to build a PDF viewer, it only ships with a simple default viewer implementation for demo purpose
- uses no library/framework other than the PDF.JS library
- flexibel, modular, easy to replace parts with other implementations

# Future Plans & Missing Implementations

- cache rendered pages
- use already rendered page image as placeholder if the zoom of the page changes
- two pages support
- page-wise scrolling
- full-screen support
- form support
- annotation support
- more APIS: go to next/previous page, rotatePage, ...
- indicator (spinner) when page has not finished rendering
- text selection
- search
- printing (as much as this is possible with current browsers)

# Run locally

Some browsers (like Chrome) need to load the `index.html` file using a local web server. This can easily done by installing the dev-dependencies:

```
$> npm install
```

Starting the server is done by executing:

```
$> grunt server
```

This will start a local web server on port 9996. To server the index.html, point your browser at http://localhost:9996/.

# License

This project uses the same license (Apache License) as the PDF.JS project. This makes pdfListView compatible with PDF.JS and makes reusing code between the projects possible.
