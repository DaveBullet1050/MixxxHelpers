#!/bin/bash

# Queries the open windows and extracts the song "Artist - Title" from the main Mixxx window (or empty string)
# if Mixxx is not running or idle

wmctrl -l | grep "Mixxx$" | cut -f 5- -d" " | awk -F ' \\| Mixxx|Mixxx' 'NF&&$1!=""{print $1}'