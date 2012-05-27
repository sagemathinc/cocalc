MIT licensed and from https://github.com/neteye/jquery-plugins


NETEYE Activity Indicator
=========================

A jQuery plugin that renders a translucent activity indicator (spinner)
using SVG or VML.

Features
--------

* Lightweight script
* No images required
* No external CSS
* Resolution independent
* Alpha transparency
* Highly configurable appearance
* Works in all major browsers
* Uses feature detection
* Degrades gracefully

Supported Browsers
------------------

The plugin has been successfully tested in the following browsers:

* Firefox 2.0
* Safari 3.2.1
* Internet Explorer 6.0
* Opera 10.6

Of course newer versions of the various browsers are also supported.

Dependencies
------------

The plugin requires jQuery v1.4.2 (or higher).
Besides that, no other files are required, especially no style-sheets
or images.

Usage
-----

To render the default indicator, invoke `.activity()`. To remove it, call
`.activity(false)`. You may pass an options object to customize the 
appearance:

 - **segments**
   The number of lines to draw. Default is `12`.

 - **width**
   The width of each line. Default is `4`.

 - **space**
   The space between the inner ends of the lines. Default is `3`.

 - **length**
   The length of the lines. Default is `7`.

 - **color**
   The color. Supported formats are #rgb and #rrggbb.
   Default is the target element's text color.

 - **steps**
   The size of the gradient specified in number of segements.
   All segments with an index greater than this value will
   have the same opacity. Default is `segments-1`.

 - **opacity**
   The opacity of the lightest segment. Default is `1/steps`.

 - **speed**
   Rotation speed in rounds per second. Default is `1.2`.

 - **align**
   The horizontal alignment. Possible values are `left`, `right` 
   or `center` (default).

 - **valign**
   The vertical alignment. Possible values are `top`, `bottom` 
   or `center` (default).

 - **padding**
   Extra padding around the indicator. Default is `4`.

 - **outside**
   Whether the spinner should be added to the body rather than
   to the target element. Useful if the target doesn't support
   nested elements, for example img, object or input elements.
   Default is `false`.


You may change the global defaults by modifying the `$.fn.activity.defaults` object.

Links
-----

* Author:  [Felix Gnass](http://github.com/fgnass)
* Company: [NETEYE](http://neteye.de)
* License: [MIT](http://neteye.github.com/MIT-LICENSE.txt)
* Demo:    http://neteye.github.com/activity-indicator.html

Please use the [GitHub issue tracker]{http://github.com/neteye/jquery-plugins/issues} for bug
reports and feature requests.
