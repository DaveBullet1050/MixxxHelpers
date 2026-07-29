# Switch beat (per track)

These scripts are only relevant if you use lighting software and connect Mixxx for sending beat nodes via MIDI.  If you want to use them, you must install the beatItAutoDJ controller script and XML (as per parent page).  

Mixxx beat grids sometimes align to the upbeat or the downbeat.  The problem is, this can vary per song and manually aligning the grid can cause other issues and is laborious.  

Instead, these scripts (for Linux Mixxx installations) monitor for track changes in Mixxx, check a database for whether half or full (grid aligned beat) should be used when sending a beat signal (via MIDI port) to the connected lighting software (e.g. QLC+).  

## Installation
1. Copy the contents of this folder to /usr/local/bin (or anywhere you want to deploy)  
2. Either run script or deploy as a service:  
a) run in backround:  
`switch_beat.sh &`  
b) deploy as systemd service:  
Edit the:  
`switch-beat.service`
and replace the path to the switch_beat.sh depending on where you deployed it.
Move the service to where systemd can see it:  
`cp switch-beat.service /etc/systemd/system`  
then run:  
```
systemctl daemon-reload
systemctl enable --now switch-beat.service
```

With the script running, when a Mixxx track changes, it will lookup the database and send a half or full beat signal to change to align to the track being faded in.  

## Setting new track beats

Since the database is empty you need to learn new tracks.  The best option is to play your setlist (whether via AutoDJ or just your library - doesn't matter) and when you see the beat occurring, run either of these until you get your lights flashing when you like on the down (half) or up (full) beat:  
`store_beat.sh full`  
or  
`store_beat.sh half`  

The currently playing track (in the Mixxx window title) with your preference will be stored in:  
`track_beat_db.txt`  
and recalled when that track plays next, with the switch_beat.sh sending a midi signal to control half or full beat play.  
