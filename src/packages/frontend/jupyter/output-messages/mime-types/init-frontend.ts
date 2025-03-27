// Import the MIME type handlers that can be used in our
// frontend.  They can be importable only on the frontend,
// and the assumption is that they are not being used
// in a read-only context.  E.g., the widget one supports
// ipywidgets.

import "./text-plain";
import "./markdown";
import "./html";
import "./widget";
import "./image";
import "./iframe";
import "./javascript";
import "./pdf";
import "./latex";
