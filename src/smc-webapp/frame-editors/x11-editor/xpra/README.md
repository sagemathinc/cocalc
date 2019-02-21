# CoCalc Xpra

## What is this?

This is an HTML5 Javascript client for https://xpra.org/.
It makes it so CoCalc can use Xpra to provide x11 support,
which is used by the x11-editor plugin.

This code could probably be used separately from CoCalc, but that
is left as an exercise for now.

## History

The history of this code is:

1. many Xpra developers spent several years writing an HTML5 client for Xpra. It's written in an "old" Javascript style, and meant to support a very wide range of old browsers.

2. Anders Evenrud rewrote the xpra html5 client to be more modern and smaller (so support less archiac browsers) for use in his [OS.js](https://www.os-js.org/) project.

3. I took a snapshot of Evenrud's repo in Oct 2018 and also of the official xpra-html5 client, and rewrote it all in Typescript finishing some todos, and using modern ES6 classes, async/await, etc., to produce this. Also, I've changed code and assumptions at will to support:
   - a tabbed interface
   - dynamic scaling
   - multiple users

## License: MPL

- The original HTML5 client is licensed under the Mozilla Public License.  This license applies to the code in this directory only, as it is a derived work. The MPL is NOT viral, in that it does not apply to any code outside this directory.

- Anders Evenenrud's [xpra client](https://github.com/andersevenrud/xpra-html5-client) is derived from the official xpra html5 client, though the code is all rewritten in a different style, it's still pretty much copy/paste/reformat.  So it must be MPL licensed. He recently updated the license properly.

