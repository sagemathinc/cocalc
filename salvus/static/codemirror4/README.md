# CodeMirror
[![Build Status](https://travis-ci.org/marijnh/CodeMirror.svg)](https://travis-ci.org/marijnh/CodeMirror)
[![NPM version](https://img.shields.io/npm/v/codemirror.svg)](https://www.npmjs.org/package/codemirror)

CodeMirror is a JavaScript component that provides a code editor in
the browser. When a mode is available for the language you are coding
in, it will color your code, and optionally help with indentation.

The project page is http://codemirror.net  
The manual is at http://codemirror.net/doc/manual.html  
The contributing guidelines are in [CONTRIBUTING.md](https://github.com/marijnh/CodeMirror/blob/master/CONTRIBUTING.md)
diff --git a/salvus/static/codemirror4/lib/codemirror.js b/salvus/static/codemirror4/lib/codemirror.js
index f106f79..43a5711 100644
--- a/salvus/static/codemirror4/lib/codemirror.js
+++ b/salvus/static/codemirror4/lib/codemirror.js
@@ -2341,7 +2341,7 @@
     if (cm.somethingSelected()) {
       cm.display.prevInput = "";
       var range = doc.sel.primary();
-      minimal = hasCopyEvent &&
+      minimal = false && hasCopyEvent &&
         (range.to().line - range.from().line > 100 || (selected = cm.getSelection()).length > 1000);
       var content = minimal ? "-" : selected || cm.getSelection();
       cm.display.input.value = content;
