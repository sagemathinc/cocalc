/*
Register the LEAN theorem prover editor
*/

import {Editor}   from './editor';
import {Actions}  from './actions';

import {register_file_editor} from '../frame-tree/register';

// Load plugin so that codemirror can automatically insert LEAN symbols
import "./codemirror-lean-symbols";

register_file_editor({
    ext       : 'lean',
    component : Editor,
    Actions
});