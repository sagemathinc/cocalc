# Embedded CoCalc Examples

These embedded example source files are a set of [YAML documents](http://www.yaml.org/).

Each one of them is a list of individual "documents",
where the delimiter is the usual "---".

The are composed of:

1. Header, consisting of the language specification and the category.
   They are fixed for the entire file.
   The category definition has two levels and is either a list of strings
   or a single string with a "/" as delimiter.
   Together with the overall language, categories must be unique.
   Inside a yaml file, the category can change
   (only once, though, due to the overall uniqueness constraint)
2. The actual entries consists of `title`, `descr`, and `code`.
   Where `code` is best written with "|" for verbatim text and `descr` using ">" for multi-line flow-text.
   Feel free to use Markdown for the `descr` content.
   If there are errors with the title, enclose it in quotes.
   All entries per category retain their ordering!

   Example:

       title: Getting Help
       descr: >
            Sage has extensive built-in documentation,
            accessible by typing the name of a function or
            a constant (for example), followed by a question mark:

            ```
            log2?
            ```

            It's also possible to use the `help(...)` function.
       code: |
            log2?
            help(log2)

## License

[Creative Commons: Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)
