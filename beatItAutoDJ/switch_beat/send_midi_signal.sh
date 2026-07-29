#!/bin/bash

# Args:
# $1 (optional): full or half.  Defaults to none to allow Mixxx to choose the default
# $2 (optional): beat lead time to apply in miliseconds (up to 3 digits)

MIDI_PORT="Midi Through Port-0"
MIDI_CHANNEL=1

# Send the appropriate midi signal, arbitrary hex values we'll decipher on receipt in Mixxx JS
case "$1" in
    full )  BEAT=2
            ;;
    half )  BEAT=1
            ;;
    * )     BEAT=0
esac

if [[ -n "$2" ]]; then
    BEAT_LEAD=$2
    if [[ ! "$BEAT_LEAD" =~ ^[0-9]+$ ]]; then
        echo "If lead time is passed as 2nd argument, it must be an integer.  Exiting."
        exit 1
    fi

    # Send each digit as a character for recomposition in Mixxx as a number
    for (( i=0; i<${#BEAT_LEAD}; i++ )); do
        BEAT_CHAR=$BEAT_CHAR" ${BEAT_LEAD:i:1}"
    done

    # We will only pass 3 digits for lead time
    #BEAT_LEAD="${2:0:3}"
    #echo $BEAT_CHAR
    #PADDED_BEAT_LEAD=$(printf "%03d" "$BEAT_LEAD")
    #echo $PADDED_BEAT_LEAD
    #BEAT_HEX=$(echo -n "$BEAT_CHAR" | od -An -t x1 | tr -d '\n' | tr -s ' ' | sed 's/^ //')

    MIDI_COMMAND="$BEAT$BEAT_CHAR"
else
    MIDI_COMMAND="$BEAT"
fi

#echo "$MIDI_COMMAND"

# Sample code for sending note values
#sendmidi dev "$MIDI_PORT" ch 1 on 1 $NOTE_VAL
sendmidi dev "$MIDI_PORT" syx ${MIDI_COMMAND}