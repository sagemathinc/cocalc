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

## License: GPLv2+

- Xpra is a GPLv2+ program, so the original html5 xpra client is only available under the GPLv2+ license.

- Anders Evenenrud's [xpra client](https://github.com/andersevenrud/xpra-html5-client) is clearly derived from the official xpra html5 client, though the code is all rewritten in a different style, it's still pretty much copy/paste/reformat. It's clearly a derived work. That original client is GPL'd. Thus Ander's https://github.com/andersevenrud/xpra-html5-client legally has to be GPLv2+ licensed. However, he declared it MIT licensed, which is a GPL violation (you cannot just relicese GPL code as MIT). For our purposes, we'll just consider it to also be GPLv2+, though of course I _wish_ it were MIT licensed. This is not a problem for CoCalc, since CoCalc is AGPLv3+. It will be a problem for [OS.js](https://www.os-js.org/) if they care, since that program is 2-clause BSD licensed.

- Implication: any version of cocalc that includes this smc-webapp/frame-editors/x11-editor/xpra directory, MUST be released under GPLv2+ or compatible license. This will matter if we ever need to relicense cocalc for some company. If that happens, we'll have to delete the x11-editor code from the different-licensed version. That would be easy.
