/* Newest answer at https://stackoverflow.com/questions/1043339/javascript-for-detecting-browser-language-preference */

export function language(): string {
  let nav = window.navigator,
    browserLanguagePropertyKeys = [
      "language",
      "browserLanguage",
      "systemLanguage",
      "userLanguage"
    ],
    i,
    language;

  // support for HTML 5.1 "navigator.languages"
  if (Array.isArray(nav.languages)) {
    for (i = 0; i < nav.languages.length; i++) {
      language = nav.languages[i];
      if (language && language.length) {
        return language;
      }
    }
  }

  // support for other well known properties in browsers
  for (i = 0; i < browserLanguagePropertyKeys.length; i++) {
    language = nav[browserLanguagePropertyKeys[i]];
    if (language && language.length) {
      return language;
    }
  }

  return '';
}
