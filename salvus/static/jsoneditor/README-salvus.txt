See https://github.com/josdejong/jsoneditoronline

I minified using 

  uglifyjs2 jsoneditor.js > jsoneditor.min.js

I fixed one bug:

 wstein@ubuntu64:~/salvus0/jsoneditoronline$ git diff
diff --git a/jsoneditor/jsoneditor.js b/jsoneditor/jsoneditor.js
index 5f9c76b..824917a 100644
--- a/jsoneditor/jsoneditor.js
+++ b/jsoneditor/jsoneditor.js
@@ -3398,13 +3398,12 @@ JSONEditor.SearchBox.prototype.onDelayedSearch = function (event) {
  */
 JSONEditor.SearchBox.prototype.onSearch = function (event, forceSearch) {
     this.clearDelay();
-
     var value = this.dom.search.value;
     var text = (value.length > 0) ? value : undefined;
     if (text != this.lastText || forceSearch) {
         // only search again when changed
         this.lastText = text;
-        this.results = editor.search(text);
+        this.results = this.editor.search(text);
         this.setActiveResult(undefined);
 
         // display search results

