/*
 * CoCalc's Xpra HTML Client
 *
 * ---
 *
 * Xpra
 * Copyright (c) 2013-2017 Antoine Martin <antoine@devloop.org.uk>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015-2016 Spikes, Inc.
 * Copyright (c) 2018-2019 SageMath, Inc.
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 */
// this is based on /usr/share/X11/xkb/rules/evdev.lst
// the "keyboard layouts" define the basics, and we assume its pc105 keys
// regarding "variant", down below are configs and defaults for certain layouts

export const PHYSICAL_KEYBOARDS = [
  { value: "default", display: "Default (language-based guess)" },
  { value: "us", display: "English (US)" },
  { value: "af", display: "Afghani" },
  { value: "ara", display: "Arabic" },
  { value: "al", display: "Albanian" },
  { value: "am", display: "Armenian" },
  { value: "at", display: "German (Austria)" },
  { value: "au", display: "English (Australian)" },
  { value: "az", display: "Azerbaijani" },
  { value: "by", display: "Belarusian" },
  { value: "be", display: "Belgian" },
  { value: "bd", display: "Bangla" },
  { value: "in", display: "Indian" },
  { value: "ba", display: "Bosnian" },
  { value: "br", display: "Portuguese (Brazil)" },
  { value: "bg", display: "Bulgarian" },
  { value: "dz", display: "Berber (Algeria, Latin)" },
  { value: "ma", display: "Arabic (Morocco)" },
  { value: "cm", display: "English (Cameroon)" },
  { value: "mm", display: "Burmese" },
  { value: "ca", display: "French (Canada)" },
  { value: "cd", display: "French (Democratic Republic of the Congo)" },
  { value: "cn", display: "Chinese" },
  { value: "hr", display: "Croatian" },
  { value: "cz", display: "Czech" },
  { value: "dk", display: "Danish" },
  { value: "nl", display: "Dutch" },
  { value: "bt", display: "Dzongkha" },
  { value: "ee", display: "Estonian" },
  { value: "ir", display: "Persian" },
  { value: "iq", display: "Iraqi" },
  { value: "fo", display: "Faroese" },
  { value: "fi", display: "Finnish" },
  { value: "fr", display: "French" },
  { value: "gh", display: "English (Ghana)" },
  { value: "gn", display: "French (Guinea)" },
  { value: "ge", display: "Georgian" },
  { value: "de", display: "German" },
  { value: "gr", display: "Greek" },
  { value: "hu", display: "Hungarian" },
  { value: "is", display: "Icelandic" },
  { value: "il", display: "Hebrew" },
  { value: "it", display: "Italian" },
  { value: "jp", display: "Japanese" },
  { value: "kg", display: "Kyrgyz" },
  { value: "kh", display: "Khmer (Cambodia)" },
  { value: "kz", display: "Kazakh" },
  { value: "la", display: "Lao" },
  { value: "latam", display: "Spanish (Latin American)" },
  { value: "lt", display: "Lithuanian" },
  { value: "lv", display: "Latvian" },
  { value: "mao", display: "Maori" },
  { value: "me", display: "Montenegrin" },
  { value: "mk", display: "Macedonian" },
  { value: "mt", display: "Maltese" },
  { value: "mn", display: "Mongolian" },
  { value: "no", display: "Norwegian" },
  { value: "pl", display: "Polish" },
  { value: "pt", display: "Portuguese" },
  { value: "ro", display: "Romanian" },
  { value: "ru", display: "Russian" },
  { value: "rs", display: "Serbian" },
  { value: "si", display: "Slovenian" },
  { value: "sk", display: "Slovak" },
  { value: "es", display: "Spanish" },
  { value: "se", display: "Swedish" },
  { value: "ch", display: "German (Switzerland)" },
  { value: "sy", display: "Arabic (Syria)" },
  { value: "tj", display: "Tajik" },
  { value: "lk", display: "Sinhala (phonetic)" },
  { value: "th", display: "Thai" },
  { value: "tr", display: "Turkish" },
  { value: "tw", display: "Taiwanese" },
  { value: "ua", display: "Ukrainian" },
  { value: "gb", display: "English (UK)" },
  { value: "uz", display: "Uzbek" },
  { value: "vn", display: "Vietnamese" },
  { value: "kr", display: "Korean" },
  { value: "nec_vndr/jp", display: "Japanese (PC-98)" },
  { value: "ie", display: "Irish" },
  { value: "pk", display: "Urdu (Pakistan)" },
  { value: "mv", display: "Dhivehi" },
  { value: "za", display: "English (South Africa)" },
  { value: "epo", display: "Esperanto" },
  { value: "np", display: "Nepali" },
  { value: "ng", display: "English (Nigeria)" },
  { value: "et", display: "Amharic" },
  { value: "sn", display: "Wolof" },
  { value: "brai", display: "Braille" },
  { value: "tm", display: "Turkmen" },
  { value: "ml", display: "Bambara" },
  { value: "tz", display: "Swahili (Tanzania)" },
  { value: "tg", display: "French (Togo)" },
  { value: "ke", display: "Swahili (Kenya)" },
  { value: "bw", display: "Tswana" },
  { value: "ph", display: "Filipino" },
  { value: "md", display: "Moldavian" },
  { value: "id", display: "Indonesian (Jawi)" },
  { value: "my", display: "Malay (Jawi, Arabic Keyboard)" }
];

// sort by name, and "default" should be first
PHYSICAL_KEYBOARDS.sort(function(a, b) {
  // a[0], b[0] is the key of the map
  if (a.value === "default") {
    return -1;
  } else if (b.value === "default") {
    return 1;
  } else {
    return a.display.localeCompare(b.display);
  }
});

// each keyboard could have one or more variants
// if there is non in the dictionary, use "" as a variant.
// otherwise pick "nodeadkeys" if it exists (necessary for German and probably a good idea for all other languages)
export const KEYBOARD_VARIANTS = {
  us: [
    {
      value: "chr",
      display: "Cherokee"
    },
    {
      value: "dvorak-classic",
      display: "classic Dvorak"
    },
    {
      value: "colemak",
      display: "Colemak"
    },
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "dvorak-alt-intl",
      display: "Dvorak, alt. intl."
    },
    {
      value: "dvorak-intl",
      display: "Dvorak, intl., with dead keys"
    },
    {
      value: "dvorak-l",
      display: "Dvorak, left-handed"
    },
    {
      value: "dvorak-r",
      display: "Dvorak, right-handed"
    },
    {
      value: "altgr-intl",
      display: "intl., with AltGr dead keys"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "dvp",
      display: "programmer Dvorak"
    },
    {
      value: "olpc2",
      display: "the divide/multiply keys toggle the layout"
    },
    {
      value: "hbs",
      display: "US"
    },
    {
      value: "alt-intl",
      display: "US, alt. intl."
    },
    {
      value: "euro",
      display: "US, euro on 5"
    },
    {
      value: "intl",
      display: "US, intl., with dead keys"
    },
    {
      value: "rus",
      display: "US, phonetic"
    },
    {
      value: "workman",
      display: "Workman"
    },
    {
      value: "workman-intl",
      display: "Workman, intl., with dead keys"
    }
  ],
  af: [
    {
      value: "uz",
      display: "Afghanistan"
    },
    {
      value: "fa-olpc",
      display: "Afghanistan, Dari OLPC"
    },
    {
      value: "olpc-ps",
      display: "Afghanistan, OLPC"
    },
    {
      value: "uz-olpc",
      display: "Afghanistan, OLPC"
    },
    {
      value: "ps",
      display: "Pashto"
    }
  ],
  ara: [
    {
      value: "azerty",
      display: "AZERTY"
    },
    {
      value: "azerty_digits",
      display: "AZERTY/digits"
    },
    {
      value: "buckwalter",
      display: "Buckwalter"
    },
    {
      value: "digits",
      display: "digits"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "olpc",
      display: "OLPC"
    },
    {
      value: "qwerty",
      display: "QWERTY"
    },
    {
      value: "qwerty_digits",
      display: "qwerty/digits"
    }
  ],
  al: [
    {
      value: "plisi",
      display: "Plisi"
    }
  ],
  am: [
    {
      value: "eastern-alt",
      display: "alt. eastern"
    },
    {
      value: "phonetic-alt",
      display: "alt. phonetic"
    },
    {
      value: "eastern",
      display: "eastern"
    },
    {
      value: "phonetic",
      display: "phonetic"
    },
    {
      value: "western",
      display: "western"
    }
  ],
  at: [
    {
      value: "mac",
      display: "Austria, Macintosh"
    },
    {
      value: "nodeadkeys",
      display: "Austria, no dead keys"
    },
    {
      value: "sundeadkeys",
      display: "Austria, with Sun dead keys"
    }
  ],
  az: [
    {
      value: "cyrillic",
      display: "Cyrillic"
    }
  ],
  by: [
    {
      value: "latin",
      display: "Latin"
    },
    {
      value: "legacy",
      display: "legacy"
    }
  ],
  be: [
    {
      value: "oss",
      display: "alt."
    },
    {
      value: "iso-alternate",
      display: "alt. ISO"
    },
    {
      value: "oss_latin9",
      display: "alt., Latin-9 only"
    },
    {
      value: "oss_sundeadkeys",
      display: "alt., with Sun dead keys"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "wang",
      display: "Wang 724 AZERTY"
    },
    {
      value: "sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  bd: [
    {
      value: "probhat",
      display: "Probhat"
    }
  ],
  in: [
    {
      value: "urd-phonetic3",
      display: "alt. phonetic"
    },
    {
      value: "bolnagri",
      display: "Bolnagri"
    },
    {
      value: "eeyek",
      display: "Eeyek"
    },
    {
      value: "mal_enhanced",
      display: "enhanced Inscript, with rupee"
    },
    {
      value: "guj",
      display: "Gujarati"
    },
    {
      value: "guru",
      display: "Gurmukhi"
    },
    {
      value: "jhelum",
      display: "Gurmukhi Jhelum"
    },
    {
      value: "ben",
      display: "India"
    },
    {
      value: "ben_baishakhi",
      display: "India, Baishakhi"
    },
    {
      value: "ben_inscript",
      display: "India, Baishakhi Inscript"
    },
    {
      value: "ben_bornona",
      display: "India, Bornona"
    },
    {
      value: "ben_probhat",
      display: "India, Probhat"
    },
    {
      value: "ben_gitanjali",
      display: "India, Uni Gitanjali"
    },
    {
      value: "eng",
      display: "India, with rupee"
    },
    {
      value: "kan-kagapa",
      display: "KaGaPa phonetic"
    },
    {
      value: "tel-kagapa",
      display: "KaGaPa phonetic"
    },
    {
      value: "hin-kagapa",
      display: "KaGaPa phonetic"
    },
    {
      value: "san-kagapa",
      display: "KaGaPa phonetic"
    },
    {
      value: "mar-kagapa",
      display: "KaGaPa phonetic"
    },
    {
      value: "kan",
      display: "Kannada"
    },
    {
      value: "tam_keyboard_with_numerals",
      display: "keyboard with numerals"
    },
    {
      value: "mal_lalitha",
      display: "Lalitha"
    },
    {
      value: "mal",
      display: "Malayalam"
    },
    {
      value: "olck",
      display: "Ol Chiki"
    },
    {
      value: "ori",
      display: "Oriya"
    },
    {
      value: "urd-phonetic",
      display: "phonetic"
    },
    {
      value: "tel-sarala",
      display: "Sarala"
    },
    {
      value: "tam_TAB",
      display: "TAB typewriter"
    },
    {
      value: "tam",
      display: "Tamil"
    },
    {
      value: "tel",
      display: "Telugu"
    },
    {
      value: "tam_TSCII",
      display: "TSCII typewriter"
    },
    {
      value: "tam_unicode",
      display: "Unicode"
    },
    {
      value: "urd-winkeys",
      display: "Win keys"
    },
    {
      value: "hin-wx",
      display: "Wx"
    }
  ],
  ba: [
    {
      value: "unicodeus",
      display: "US, with Bosnian digraphs"
    },
    {
      value: "us",
      display: "US, with Bosnian letters"
    },
    {
      value: "unicode",
      display: "with Bosnian digraphs"
    },
    {
      value: "alternatequotes",
      display: "with guillemets"
    }
  ],
  br: [
    {
      value: "dvorak",
      display: "Brazil, Dvorak"
    },
    {
      value: "thinkpad",
      display: "Brazil, IBM/Lenovo ThinkPad"
    },
    {
      value: "nativo",
      display: "Brazil, Nativo"
    },
    {
      value: "nativo-epo",
      display: "Brazil, Nativo"
    },
    {
      value: "nativo-us",
      display: "Brazil, Nativo for US keyboards"
    },
    {
      value: "nodeadkeys",
      display: "Brazil, no dead keys"
    }
  ],
  bg: [
    {
      value: "bas_phonetic",
      display: "new phonetic"
    },
    {
      value: "phonetic",
      display: "traditional phonetic"
    }
  ],
  dz: [
    {
      value: "ar",
      display: "Algeria"
    },
    {
      value: "ber",
      display: "Algeria, Tifinagh"
    }
  ],
  ma: [
    {
      value: "french",
      display: "Morocco"
    },
    {
      value: "tifinagh",
      display: "Morocco, Tifinagh"
    },
    {
      value: "tifinagh-alt",
      display: "Morocco, Tifinagh alt."
    },
    {
      value: "tifinagh-alt-phonetic",
      display: "Morocco, Tifinagh alt. phonetic"
    },
    {
      value: "tifinagh-extended",
      display: "Morocco, Tifinagh extended"
    },
    {
      value: "tifinagh-extended-phonetic",
      display: "Morocco, Tifinagh extended phonetic"
    },
    {
      value: "tifinagh-phonetic",
      display: "Morocco, Tifinagh phonetic"
    }
  ],
  cm: [
    {
      value: "azerty",
      display: "AZERTY"
    },
    {
      value: "french",
      display: "Cameroon"
    },
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "mmuock",
      display: "Mmuock"
    },
    {
      value: "qwerty",
      display: "QWERTY"
    }
  ],
  ca: [
    {
      value: "multi",
      display: "1st part"
    },
    {
      value: "multi-2gr",
      display: "2nd part"
    },
    {
      value: "eng",
      display: "Canada"
    },
    {
      value: "fr-dvorak",
      display: "Canada, Dvorak"
    },
    {
      value: "fr-legacy",
      display: "Canada, legacy"
    },
    {
      value: "multix",
      display: "Canadian Multilingual"
    },
    {
      value: "ike",
      display: "Inuktitut"
    }
  ],
  cn: [
    {
      value: "tib",
      display: "Tibetan"
    },
    {
      value: "ug",
      display: "Uyghur"
    },
    {
      value: "tib_asciinum",
      display: "with ASCII numerals"
    }
  ],
  hr: [
    {
      value: "unicodeus",
      display: "US, with Croatian digraphs"
    },
    {
      value: "us",
      display: "US, with Croatian letters"
    },
    {
      value: "unicode",
      display: "with Croatian digraphs"
    },
    {
      value: "alternatequotes",
      display: "with guillemets"
    }
  ],
  cz: [
    {
      value: "rus",
      display: "Czech, phonetic"
    },
    {
      value: "qwerty",
      display: "QWERTY"
    },
    {
      value: "qwerty_bksl",
      display: "QWERTY, extended backslash"
    },
    {
      value: "ucw",
      display: "UCW, only accented letters"
    },
    {
      value: "dvorak-ucw",
      display: "US, Dvorak, UCW support"
    },
    {
      value: "bksl",
      display: "with &lt;\\|&gt; key"
    }
  ],
  dk: [
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "mac_nodeadkeys",
      display: "Macintosh, no dead keys"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "winkeys",
      display: "Win keys"
    }
  ],
  nl: [
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "std",
      display: "standard"
    },
    {
      value: "sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  ee: [
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "us",
      display: "US, with Estonian letters"
    }
  ],
  ir: [
    {
      value: "ku_ara",
      display: "Iran, Arabic-Latin"
    },
    {
      value: "ku_f",
      display: "Iran, F"
    },
    {
      value: "ku_alt",
      display: "Iran, Latin Alt-Q"
    },
    {
      value: "ku",
      display: "Iran, Latin Q"
    },
    {
      value: "pes_keypad",
      display: "with Persian keypad"
    }
  ],
  iq: [
    {
      value: "ku_ara",
      display: "Iraq, Arabic-Latin"
    },
    {
      value: "ku_f",
      display: "Iraq, F"
    },
    {
      value: "ku_alt",
      display: "Iraq, Latin Alt-Q"
    },
    {
      value: "ku",
      display: "Iraq, Latin Q"
    }
  ],
  fo: [
    {
      value: "nodeadkeys",
      display: "no dead keys"
    }
  ],
  fi: [
    {
      value: "classic",
      display: "classic"
    },
    {
      value: "nodeadkeys",
      display: "classic, no dead keys"
    },
    {
      value: "smi",
      display: "Finland"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "winkeys",
      display: "Winkeys"
    }
  ],
  fr: [
    {
      value: "oss",
      display: "alt."
    },
    {
      value: "oss_latin9",
      display: "alt., Latin-9 only"
    },
    {
      value: "oss_nodeadkeys",
      display: "alt., no dead keys"
    },
    {
      value: "oss_sundeadkeys",
      display: "alt., with Sun dead keys"
    },
    {
      value: "azerty",
      display: "AZERTY"
    },
    {
      value: "bepo",
      display: "Bepo, ergonomic, Dvorak way"
    },
    {
      value: "bepo_latin9",
      display: "Bepo, ergonomic, Dvorak way, Latin-9 only"
    },
    {
      value: "bre",
      display: "Breton"
    },
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "geo",
      display: "France, AZERTY Tskapo"
    },
    {
      value: "latin9",
      display: "legacy, alt."
    },
    {
      value: "latin9_nodeadkeys",
      display: "legacy, alt., no dead keys"
    },
    {
      value: "latin9_sundeadkeys",
      display: "legacy, alt., with Sun dead keys"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "oci",
      display: "Occitan"
    },
    {
      value: "sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  gh: [
    {
      value: "akan",
      display: "Akan"
    },
    {
      value: "avn",
      display: "Avatime"
    },
    {
      value: "ewe",
      display: "Ewe"
    },
    {
      value: "fula",
      display: "Fula"
    },
    {
      value: "ga",
      display: "Ga"
    },
    {
      value: "hausa",
      display: "Ghana"
    },
    {
      value: "gillbt",
      display: "Ghana, GILLBT"
    },
    {
      value: "generic",
      display: "Ghana, multilingual"
    }
  ],
  ge: [
    {
      value: "ergonomic",
      display: "ergonomic"
    },
    {
      value: "ru",
      display: "Georgia"
    },
    {
      value: "os",
      display: "Georgia"
    },
    {
      value: "mess",
      display: "MESS"
    }
  ],
  de: [
    {
      value: "deadacute",
      display: "dead acute"
    },
    {
      value: "deadgraveacute",
      display: "dead grave acute"
    },
    {
      value: "deadtilde",
      display: "dead tilde"
    },
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "ro",
      display: "Germany"
    },
    {
      value: "tr",
      display: "Germany"
    },
    {
      value: "ro_nodeadkeys",
      display: "Germany, no dead keys"
    },
    {
      value: "ru",
      display: "Germany, phonetic"
    },
    {
      value: "dsb",
      display: "Lower Sorbian"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "mac_nodeadkeys",
      display: "Macintosh, no dead keys"
    },
    {
      value: "neo",
      display: "Neo 2"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "qwerty",
      display: "QWERTY"
    },
    {
      value: "dsb_qwertz",
      display: "QWERTZ"
    },
    {
      value: "T3",
      display: "T3"
    },
    {
      value: "sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  gr: [
    {
      value: "extended",
      display: "extended"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "polytonic",
      display: "polytonic"
    },
    {
      value: "simple",
      display: "simple"
    }
  ],
  hu: [
    {
      value: "101_qwerty_comma_dead",
      display: "101/QWERTY/comma/dead keys"
    },
    {
      value: "101_qwerty_comma_nodead",
      display: "101/QWERTY/comma/no dead keys"
    },
    {
      value: "101_qwerty_dot_dead",
      display: "101/QWERTY/dot/dead keys"
    },
    {
      value: "101_qwerty_dot_nodead",
      display: "101/QWERTY/dot/no dead keys"
    },
    {
      value: "101_qwertz_comma_dead",
      display: "101/QWERTZ/comma/dead keys"
    },
    {
      value: "101_qwertz_comma_nodead",
      display: "101/QWERTZ/comma/no dead keys"
    },
    {
      value: "101_qwertz_dot_dead",
      display: "101/QWERTZ/dot/dead keys"
    },
    {
      value: "101_qwertz_dot_nodead",
      display: "101/QWERTZ/dot/no dead keys"
    },
    {
      value: "102_qwerty_comma_dead",
      display: "102/QWERTY/comma/dead keys"
    },
    {
      value: "102_qwerty_comma_nodead",
      display: "102/QWERTY/comma/no dead keys"
    },
    {
      value: "102_qwerty_dot_dead",
      display: "102/QWERTY/dot/dead keys"
    },
    {
      value: "102_qwerty_dot_nodead",
      display: "102/QWERTY/dot/no dead keys"
    },
    {
      value: "102_qwertz_comma_dead",
      display: "102/QWERTZ/comma/dead keys"
    },
    {
      value: "102_qwertz_comma_nodead",
      display: "102/QWERTZ/comma/no dead keys"
    },
    {
      value: "102_qwertz_dot_dead",
      display: "102/QWERTZ/dot/dead keys"
    },
    {
      value: "102_qwertz_dot_nodead",
      display: "102/QWERTZ/dot/no dead keys"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "qwerty",
      display: "QWERTY"
    },
    {
      value: "standard",
      display: "standard"
    }
  ],
  is: [
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "mac_legacy",
      display: "Macintosh, legacy"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "Sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  il: [
    {
      value: "biblical",
      display: "Biblical, Tiro"
    },
    {
      value: "lyx",
      display: "lyx"
    },
    {
      value: "phonetic",
      display: "phonetic"
    }
  ],
  it: [
    {
      value: "ibm",
      display: "IBM 142"
    },
    {
      value: "intl",
      display: "intl., with dead keys"
    },
    {
      value: "geo",
      display: "Italy"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "scn",
      display: "Sicilian"
    },
    {
      value: "us",
      display: "US, with Italian letters"
    },
    {
      value: "winkeys",
      display: "Winkeys"
    }
  ],
  jp: [
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "kana",
      display: "Kana"
    },
    {
      value: "kana86",
      display: "Kana 86"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "OADG109A",
      display: "OADG 109A"
    }
  ],
  kg: [
    {
      value: "phonetic",
      display: "phonetic"
    }
  ],
  kz: [
    {
      value: "ext",
      display: "extended"
    },
    {
      value: "ruskaz",
      display: "Kazakhstan, with Kazakh"
    },
    {
      value: "kazrus",
      display: "with Russian"
    }
  ],
  la: [
    {
      value: "stea",
      display: "STEA proposed standard layout"
    }
  ],
  latam: [
    {
      value: "deadtilde",
      display: "Latin American, dead tilde"
    },
    {
      value: "dvorak",
      display: "Latin American, Dvorak"
    },
    {
      value: "nodeadkeys",
      display: "Latin American, no dead keys"
    },
    {
      value: "sundeadkeys",
      display: "Latin American, with Sun dead keys"
    }
  ],
  lt: [
    {
      value: "ibm",
      display: "IBM LST 1205-92"
    },
    {
      value: "lekp",
      display: "LEKP"
    },
    {
      value: "lekpa",
      display: "LEKPa"
    },
    {
      value: "std",
      display: "standard"
    },
    {
      value: "us",
      display: "US, with Lithuanian letters"
    }
  ],
  lv: [
    {
      value: "adapted",
      display: "adapted"
    },
    {
      value: "apostrophe",
      display: "apostrophe"
    },
    {
      value: "ergonomic",
      display: "ergonomic, \u016aGJRMV"
    },
    {
      value: "fkey",
      display: "F"
    },
    {
      value: "modern",
      display: "modern"
    },
    {
      value: "tilde",
      display: "tilde"
    }
  ],
  me: [
    {
      value: "cyrillic",
      display: "Cyrillic"
    },
    {
      value: "cyrillicalternatequotes",
      display: "Cyrillic with guillemets"
    },
    {
      value: "cyrillicyz",
      display: "Cyrillic, ZE and ZHE swapped"
    },
    {
      value: "latinalternatequotes",
      display: "Latin with guillemets"
    },
    {
      value: "latinyz",
      display: "Latin, QWERTY"
    },
    {
      value: "latinunicode",
      display: "Latin, Unicode"
    },
    {
      value: "latinunicodeyz",
      display: "Latin, Unicode, QWERTY"
    }
  ],
  mk: [
    {
      value: "nodeadkeys",
      display: "no dead keys"
    }
  ],
  mt: [
    {
      value: "us",
      display: "with US layout"
    }
  ],
  no: [
    {
      value: "colemak",
      display: "Colemak"
    },
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "mac_nodeadkeys",
      display: "Macintosh, no dead keys"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "smi",
      display: "Norway"
    },
    {
      value: "smi_nodeadkeys",
      display: "Norway, no dead keys"
    },
    {
      value: "winkeys",
      display: "Win keys"
    }
  ],
  pl: [
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "dvorak_altquotes",
      display: "Dvorak, with Polish quotes on key 1"
    },
    {
      value: "dvorak_quotes",
      display: "Dvorak, with Polish quotes on quotemark key"
    },
    {
      value: "csb",
      display: "Kashubian"
    },
    {
      value: "legacy",
      display: "legacy"
    },
    {
      value: "ru_phonetic_dvorak",
      display: "Poland, phonetic Dvorak"
    },
    {
      value: "dvp",
      display: "programmer Dvorak"
    },
    {
      value: "qwertz",
      display: "QWERTZ"
    },
    {
      value: "szl",
      display: "Silesian"
    }
  ],
  pt: [
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "mac_nodeadkeys",
      display: "Macintosh, no dead keys"
    },
    {
      value: "mac_sundeadkeys",
      display: "Macintosh, with Sun dead keys"
    },
    {
      value: "nativo",
      display: "Nativo"
    },
    {
      value: "nativo-us",
      display: "Nativo for US keyboards"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "nativo-epo",
      display: "Portugal, Nativo"
    },
    {
      value: "sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  ro: [
    {
      value: "cedilla",
      display: "cedilla"
    },
    {
      value: "std",
      display: "standard"
    },
    {
      value: "std_cedilla",
      display: "standard cedilla"
    },
    {
      value: "winkeys",
      display: "Win keys"
    }
  ],
  ru: [
    {
      value: "bak",
      display: "Bashkirian"
    },
    {
      value: "cv",
      display: "Chuvash"
    },
    {
      value: "dos",
      display: "DOS"
    },
    {
      value: "xal",
      display: "Kalmyk"
    },
    {
      value: "kom",
      display: "Komi"
    },
    {
      value: "cv_latin",
      display: "Latin"
    },
    {
      value: "legacy",
      display: "legacy"
    },
    {
      value: "os_legacy",
      display: "legacy"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "chm",
      display: "Mari"
    },
    {
      value: "phonetic",
      display: "phonetic"
    },
    {
      value: "phonetic_azerty",
      display: "phonetic, AZERTY"
    },
    {
      value: "phonetic_dvorak",
      display: "phonetic, Dvorak"
    },
    {
      value: "phonetic_fr",
      display: "phonetic, French"
    },
    {
      value: "phonetic_winkeys",
      display: "phonetic, with Win keys"
    },
    {
      value: "srp",
      display: "Russia"
    },
    {
      value: "tt",
      display: "Tatar"
    },
    {
      value: "typewriter",
      display: "typewriter"
    },
    {
      value: "typewriter-legacy",
      display: "typewriter, legacy"
    },
    {
      value: "udm",
      display: "Udmurt"
    },
    {
      value: "os_winkeys",
      display: "Win keys"
    },
    {
      value: "sah",
      display: "Yakut"
    }
  ],
  rs: [
    {
      value: "alternatequotes",
      display: "Cyrillic with guillemets"
    },
    {
      value: "yz",
      display: "Cyrillic, ZE and ZHE swapped"
    },
    {
      value: "latin",
      display: "Latin"
    },
    {
      value: "latinalternatequotes",
      display: "Latin with guillemets"
    },
    {
      value: "latinyz",
      display: "Latin, QWERTY"
    },
    {
      value: "latinunicode",
      display: "Latin, Unicode"
    },
    {
      value: "latinunicodeyz",
      display: "Latin, Unicode, QWERTY"
    },
    {
      value: "rue",
      display: "Pannonian Rusyn"
    }
  ],
  si: [
    {
      value: "us",
      display: "US, with Slovenian letters"
    },
    {
      value: "alternatequotes",
      display: "with guillemets"
    }
  ],
  sk: [
    {
      value: "bksl",
      display: "extended backslash"
    },
    {
      value: "qwerty",
      display: "QWERTY"
    },
    {
      value: "qwerty_bksl",
      display: "QWERTY, extended backslash"
    }
  ],
  es: [
    {
      value: "deadtilde",
      display: "dead tilde"
    },
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "ast",
      display: "Spain, with bottom-dot H and bottom-dot L"
    },
    {
      value: "cat",
      display: "Spain, with middle-dot L"
    },
    {
      value: "winkeys",
      display: "Win keys"
    },
    {
      value: "sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  se: [
    {
      value: "us_dvorak",
      display: "based on US Intl. Dvorak"
    },
    {
      value: "dvorak",
      display: "Dvorak"
    },
    {
      value: "mac",
      display: "Macintosh"
    },
    {
      value: "nodeadkeys",
      display: "no dead keys"
    },
    {
      value: "svdvorak",
      display: "Svdvorak"
    },
    {
      value: "smi",
      display: "Sweden"
    },
    {
      value: "rus",
      display: "Sweden, phonetic"
    },
    {
      value: "rus_nodeadkeys",
      display: "Sweden, phonetic, no dead keys"
    },
    {
      value: "swl",
      display: "Swedish Sign Language"
    }
  ],
  ch: [
    {
      value: "fr",
      display: "Switzerland"
    },
    {
      value: "legacy",
      display: "Switzerland, legacy"
    },
    {
      value: "fr_mac",
      display: "Switzerland, Macintosh"
    },
    {
      value: "de_mac",
      display: "Switzerland, Macintosh"
    },
    {
      value: "de_nodeadkeys",
      display: "Switzerland, no dead keys"
    },
    {
      value: "fr_nodeadkeys",
      display: "Switzerland, no dead keys"
    },
    {
      value: "de_sundeadkeys",
      display: "Switzerland, with Sun dead keys"
    },
    {
      value: "fr_sundeadkeys",
      display: "Switzerland, with Sun dead keys"
    }
  ],
  sy: [
    {
      value: "syc_phonetic",
      display: "phonetic"
    },
    {
      value: "ku_f",
      display: "Syria, F"
    },
    {
      value: "ku_alt",
      display: "Syria, Latin Alt-Q"
    },
    {
      value: "ku",
      display: "Syria, Latin Q"
    },
    {
      value: "syc",
      display: "Syriac"
    }
  ],
  tj: [
    {
      value: "legacy",
      display: "legacy"
    }
  ],
  lk: [
    {
      value: "tam_TAB",
      display: "Sri Lanka, TAB Typewriter"
    },
    {
      value: "tam_unicode",
      display: "Sri Lanka, Unicode"
    },
    {
      value: "us",
      display: "US, with Sinhala letters"
    }
  ],
  th: [
    {
      value: "pat",
      display: "Pattachote"
    },
    {
      value: "tis",
      display: "TIS-820.2538"
    }
  ],
  tr: [
    {
      value: "alt",
      display: "Alt-Q"
    },
    {
      value: "f",
      display: "F"
    },
    {
      value: "intl",
      display: "intl., with dead keys"
    },
    {
      value: "ku_f",
      display: "Turkey, F"
    },
    {
      value: "ku_alt",
      display: "Turkey, Latin Alt-Q"
    },
    {
      value: "ku",
      display: "Turkey, Latin Q"
    },
    {
      value: "crh_alt",
      display: "Turkish Alt-Q"
    },
    {
      value: "crh_f",
      display: "Turkish F"
    },
    {
      value: "crh",
      display: "Turkish Q"
    },
    {
      value: "sundeadkeys",
      display: "with Sun dead keys"
    }
  ],
  tw: [
    {
      value: "indigenous",
      display: "indigenous"
    },
    {
      value: "saisiyat",
      display: "Taiwan"
    }
  ],
  ua: [
    {
      value: "homophonic",
      display: "homophonic"
    },
    {
      value: "legacy",
      display: "legacy"
    },
    {
      value: "phonetic",
      display: "phonetic"
    },
    {
      value: "rstu",
      display: "standard RSTU"
    },
    {
      value: "typewriter",
      display: "typewriter"
    },
    {
      value: "rstu_ru",
      display: "Ukraine, standard RSTU"
    },
    {
      value: "winkeys",
      display: "Win keys"
    }
  ],
  gb: [
    {
      value: "colemak",
      display: "UK, Colemak"
    },
    {
      value: "dvorak",
      display: "UK, Dvorak"
    },
    {
      value: "dvorakukp",
      display: "UK, Dvorak, with UK punctuation"
    },
    {
      value: "extd",
      display: "UK, extended, with Win keys"
    },
    {
      value: "mac_intl",
      display: "UK, intl., Macintosh"
    },
    {
      value: "intl",
      display: "UK, intl., with dead keys"
    },
    {
      value: "mac",
      display: "UK, Macintosh"
    }
  ],
  uz: [
    {
      value: "latin",
      display: "Latin"
    }
  ],
  kr: [
    {
      value: "kr104",
      display: "101/104 key compatible"
    }
  ],
  ie: [
    {
      value: "CloGaelach",
      display: "CloGaelach"
    },
    {
      value: "ogam_is434",
      display: "IS434"
    },
    {
      value: "ogam",
      display: "Ogham"
    },
    {
      value: "UnicodeExpert",
      display: "UnicodeExpert"
    }
  ],
  pk: [
    {
      value: "ara",
      display: "Pakistan"
    },
    {
      value: "urd-crulp",
      display: "Pakistan, CRULP"
    },
    {
      value: "urd-nla",
      display: "Pakistan, NLA"
    },
    {
      value: "snd",
      display: "Sindhi"
    }
  ],
  epo: [
    {
      value: "legacy",
      display: "displaced semicolon and quote, obsolete"
    }
  ],
  ng: [
    {
      value: "igbo",
      display: "Igbo"
    },
    {
      value: "hausa",
      display: "Nigeria"
    },
    {
      value: "yoruba",
      display: "Yoruba"
    }
  ],
  brai: [
    {
      value: "left_hand",
      display: "left-handed"
    },
    {
      value: "right_hand",
      display: "right-handed"
    }
  ],
  tm: [
    {
      value: "alt",
      display: "Alt-Q"
    }
  ],
  ml: [
    {
      value: "fr-oss",
      display: "Mali, alt."
    },
    {
      value: "us-intl",
      display: "Mali, US, intl."
    },
    {
      value: "us-mac",
      display: "Mali, US, Macintosh"
    }
  ],
  ke: [
    {
      value: "kik",
      display: "Kikuyu"
    }
  ],
  ph: [
    {
      value: "capewell-dvorak-bay",
      display: "Capewell-Dvorak, Baybayin"
    },
    {
      value: "capewell-dvorak",
      display: "Capewell-Dvorak, Latin"
    },
    {
      value: "capewell-qwerf2k6-bay",
      display: "Capewell-QWERF 2006, Baybayin"
    },
    {
      value: "capewell-qwerf2k6",
      display: "Capewell-QWERF 2006, Latin"
    },
    {
      value: "colemak-bay",
      display: "Colemak, Baybayin"
    },
    {
      value: "colemak",
      display: "Colemak, Latin"
    },
    {
      value: "dvorak-bay",
      display: "Dvorak, Baybayin"
    },
    {
      value: "dvorak",
      display: "Dvorak, Latin"
    },
    {
      value: "qwerty-bay",
      display: "QWERTY, Baybayin"
    }
  ],
  md: [
    {
      value: "gag",
      display: "Gagauz"
    }
  ],
  my: [
    {
      value: "phonetic",
      display: "Jawi, phonetic"
    }
  ]
};
