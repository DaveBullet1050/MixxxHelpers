#!/bin/sh
#DISPLAY=:1 xdotool search --class "mixxx" key shift+F11
DISPLAY=:1 xdotool search --name "Mixxx" | tail -1 | xargs -I {} sh -c 'DISPLAY=:1 xdotool key --window {} "shift+F11"'
