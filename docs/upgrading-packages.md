# Notes on upgrading various packages

## KaTeX

Look at https://github.com/sagemathinc/cocalc/pull/3313 and see **all** the places where the exact version of KaTeX is hardcoded in CDN url's, etc.  Change them all at once!

## CodeMirror

Similar remarks to KaTeX.  Beware!

# Testing

## Jest
The following must be upgraded together.
```
jest
ts-jest
@types/jest
```