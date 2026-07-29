#!/bin/bash

# Stores the preferred beat passed being "full" or "half" against the currently playing song (if any)

DIR=$(dirname $0)
DB=${DIR}/track_beat_db.txt

cd $DIR
# Check requested beat is valid
if [ "$1" != "full" ] && [ "$1" != "half" ]; then
    echo "Must request either 'full' or 'half' beat."
    exit 1
fi

# Extract track string in "Artist - Title" format. If Mixxx is not running or paused, returnes nothing.
TRACK=$(./curr_mixxx_song.sh)

# Check if track text changed and isn't empty
if [ -z "$TRACK" ]; then
    echo "No track playing. Exiting."
    exit 1
fi

# Now we have a track, remove it from the DB, then re-add with the requested beat
grep -v "^$TRACK" $DB > $DIR/track_beat_db.bkp
echo -e "${TRACK}\t${1}" >> $DIR/track_beat_db.bkp

sort $DIR/track_beat_db.bkp > $DB

# Finally - send the updated beat to Mixxx
./send_midi_signal.sh "$1"