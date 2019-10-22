# Document our tsconfig.json.

JSON can't have comments in it, hence this file.

This line `"skipLibCheck": true` is because of [this](https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/issues/128#issuecomment-407376483) and wanting to use fork-ts-checker-webpack-plugin.  We have to have the same options between this plugin and webpack, or things don't work.