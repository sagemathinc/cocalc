// IMPORTANT: if you add/remove anything here, you have to do the same in packages/next/pages/_app.tsx
// There is a rule that CSS can only be loaded in _app.tsx directly in next apps, so we must explicitly
// list all of these there as well.

// CSS
require("codemirror/lib/codemirror.css");
require("codemirror/theme/3024-day.css");
require("codemirror/theme/3024-night.css");
require("codemirror/theme/abbott.css");
require("codemirror/theme/abcdef.css");
//require('codemirror/theme/ambiance-mobile.css') # doesn't highlight python, confusing
require("codemirror/theme/ambiance.css");
require("codemirror/theme/ayu-dark.css");
require("codemirror/theme/ayu-mirage.css");
require("codemirror/theme/base16-dark.css");
require("codemirror/theme/base16-light.css");
require("codemirror/theme/bespin.css");
require("codemirror/theme/blackboard.css");
require("codemirror/theme/cobalt.css");
require("codemirror/theme/colorforth.css");
require("codemirror/theme/darcula.css");
require("codemirror/theme/dracula.css");
require("codemirror/theme/duotone-dark.css");
require("codemirror/theme/duotone-light.css");
require("codemirror/theme/eclipse.css");
require("codemirror/theme/elegant.css");
require("codemirror/theme/erlang-dark.css");
require("codemirror/theme/gruvbox-dark.css");
require("codemirror/theme/hopscotch.css");
require("codemirror/theme/icecoder.css");
require("codemirror/theme/idea.css");
require("codemirror/theme/isotope.css");
require("codemirror/theme/juejin.css");
require("codemirror/theme/lesser-dark.css");
require("codemirror/theme/liquibyte.css");
require("codemirror/theme/lucario.css");
require("codemirror/theme/material-darker.css");
require("codemirror/theme/material-ocean.css");
require("codemirror/theme/material-palenight.css");
require("codemirror/theme/material.css");
require("codemirror/theme/mbo.css");
require("codemirror/theme/mdn-like.css");
require("codemirror/theme/midnight.css");
require("codemirror/theme/monokai.css");
require("codemirror/theme/neat.css");
require("codemirror/theme/neo.css");
require("codemirror/theme/night.css");
require("codemirror/theme/oceanic-next.css");
require("codemirror/theme/panda-syntax.css");
require("codemirror/theme/paraiso-dark.css");
require("codemirror/theme/paraiso-light.css");
require("codemirror/theme/pastel-on-dark.css");
require("codemirror/theme/railscasts.css");
require("codemirror/theme/rubyblue.css");
require("codemirror/theme/seti.css");
require("codemirror/theme/shadowfox.css");
require("codemirror/theme/solarized.css");
require("codemirror/theme/ssms.css");
require("codemirror/theme/the-matrix.css");
require("codemirror/theme/tomorrow-night-bright.css");
require("codemirror/theme/tomorrow-night-eighties.css");
require("codemirror/theme/ttcn.css");
require("codemirror/theme/twilight.css");
require("codemirror/theme/vibrant-ink.css");
require("codemirror/theme/xq-dark.css");
require("codemirror/theme/xq-light.css");
require("codemirror/theme/yeti.css");
require("codemirror/theme/yonce.css");
require("codemirror/theme/zenburn.css");

require("@cocalc/cdn/dist/cm-custom-theme/cocalc-dark.css");
require("@cocalc/cdn/dist/cm-custom-theme/cocalc-light.css");

require("./mode/mediawiki/mediawiki.css");

// Have to strengthen this to "fight off" the adverse buggy global
// impact of some of the above themes... (namely idea and darcula
// at time of writing).
require("./addon/show-hint.css");
