/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const FileUseIcon = rclass({
  displayName: "FileUse-FileIcon",

  propTypes: {
    filename: rtypes.string.isRequired
  },

  render() {
    const ext = misc.filename_extension_notilde(this.props.filename);
    return <Icon name={editor.file_icon_class(ext)} />;
  }
});
