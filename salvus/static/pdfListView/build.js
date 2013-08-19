fs = require("fs");
path = require("path");

SOURCE_DIR = "src";
BUILD_DIR = "build"
SOURCE_FILES = [
    "TextLayerBuilder.js"
];
MAIN_FILE = "PdfListView.js";

content = []
for (i = 0; i < SOURCE_FILES.length; i++) {
    var file = SOURCE_FILES[i];
    content.push(fs.readFileSync(path.join(SOURCE_DIR, file)));
}

fullSrc = fs.readFileSync(path.join(SOURCE_DIR, MAIN_FILE)).toString();
fullSrc = fullSrc.replace("//#expand __BUNDLE__", content.join("\n"));

try {
    fs.mkdirSync(BUILD_DIR);
} catch (e) {}
fs.writeFileSync(
    path.join(BUILD_DIR, MAIN_FILE),
    fullSrc
);

