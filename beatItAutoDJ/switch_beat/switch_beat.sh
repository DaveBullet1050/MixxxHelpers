#!/bin/bash

DIR=$(dirname $0)
LAST_TRACK=""
SLEEP=3
DB=${DIR}/track_beat_db.txt

cd $DIR
while true; do
    # Extract track string in "Artist - Title" format. If Mixxx is not running or paused, returnes nothing.
    TRACK=$(./curr_mixxx_song.sh)

    # Check if track text changed and isn't empty
    if [ ! -z "$TRACK" ] && [ "$TRACK" != "$LAST_TRACK" ]; then
        LAST_TRACK="$TRACK"

        # Lookup track in "database" to see if full or half beat
        PREF_BEAT=$(grep -h "^${TRACK}" $DB | cut -f2)

        #echo "$TRACK" "$PREF_BEAT"

        if [ -z "$PREF_BEAT" ]; then
            # If none chosen, we'll allow the Mixxx to use the default
            PREF_BEAT=default
        fi

        ./send_midi_signal.sh "$PREF_BEAT"
    fi
    sleep $SLEEP
done