# R Logo

source and license info: https://commons.wikimedia.org/wiki/File:R_logo.svg

# Video

## Recording

Via "Peek", 10 FPS, 1024x600

## Editing and Encoding

webm to 4x speed x264 and webm:

    ffmpeg -an -i smc-time-travel.webm -vcodec libx264 -pix_fmt yuv420p -profile:v baseline -level 3 -filter:v "setpts=0.25*PTS" -r 20 smc-time-travel-4x.mp4

    ffmpeg -an -i smc-time-travel.webm -c:v libvpx-vp9 -filter:v "setpts=0.25*PTS" -r 20 smc-time-travel-4x.webm

---

convert to GIF

     ffmpeg -i cocalc-latex-forward-inverse-2x.webm -pix_fmt rgb24 cocalc-latex-forward-inverse.gif


## References

https://gist.github.com/Vestride/278e13915894821e1d6f
