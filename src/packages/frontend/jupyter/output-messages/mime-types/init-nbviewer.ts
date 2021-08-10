// Import the MIME type handlers that can be used in our
// nbviewer implementation.  In particular, these must
// be importable via nextjs on the backend.  Also, they
// are all obviously read only.

import "./text-plain";
import "./simple-markdown";
import "./simple-html";
import "./image";
import "./iframe";