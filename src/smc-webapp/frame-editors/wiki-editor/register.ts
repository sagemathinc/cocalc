/*
Register the Wiki editor
*/

import {Editor} from './editor';
import {Actions} from './actions';

const {register_file_editor} = require('../code-editor/register-generic');

register_file_editor({
    ext       : ['wiki', 'mediawiki'],
    component : Editor,
    Actions
});