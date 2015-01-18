# SMC Wizard

These wizard source files are a set of [YAML documents](http://www.yaml.org/).

Each one of them is a list of individual "documents",
where the delimiter is exactly "---".

The are composed of:

1. Header, consisting of the language specification and the category.
   The language is fixed for the whole file,
   whereas the category can change.
   The category definition has two levels and is either a list of strings
   or a single string with a "/" as delimiter.
2. The actual entries consists of `title`, `descr`, and `code`.
   Where `code` is best written with "|" for verbatim text and `descr` using ">" for multi-line flow-text.
   Feel free to use Markdown for the `descr` content.

## License

[Creative Commons: Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)
