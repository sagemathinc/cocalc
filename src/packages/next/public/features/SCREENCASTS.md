# Screencasts

## 1. Record Screencast

Use the Chrome extension [Screen Recorder](https://chromewebstore.google.com/detail/screen-recorder/hniebljpgcogalllopnjokppmgbhaden) to record screencasts.

## 2. Export Format

Set it to record in **WebM** format, in the Screen Recorder extension.

## 3. Convert WebM to MP4

For website compatibility, convert the WebM file to MP4 format without re-encoding (preserves quality and file size):

```bash
ffmpeg -y -i input.webm -c:v copy input.mp4
```

**Command explanation:**

- `-y` - Automatically overwrite output file if it exists
- `-i input.webm` - Input file
- `-c:v copy` - Copy video stream without re-encoding (fast, preserves quality)
- `input.mp4` - Output file

**Note:** This command preserves audio if present in the source file. The `-c:v copy` codec only copies the video stream, and ffmpeg will handle audio appropriately (copy if present, omit if not). Set `-an` to remove audio.

## 4. Website Usage

Include both formats in HTML for maximum browser compatibility:

```html
<video controls>
  <source src="video.webm" type="video/webm" />
  <source src="video.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>
```
