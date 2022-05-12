// Import the MIME type handlers that can be used in our
// nbviewer implementation.  In particular, these must
// be importable via nextjs on the backend.  Also, they
// are all obviously read only.

import "./text-plain";
import "./simple-markdown";
import "./iframe-html";   // we use this instead of html-ssr to safely support things like plotly or anything else that loads dangerous html.
import "./image";
import "./pdf";
