# MixxxHelpers
Add on controllers or tips for running Mixxx - a virtual DJ booth

## beatiItAutoDJ

This MIDI controller script overcomes some limitations with the built in AutoDJ.  By default AutoDJ has a master deck and will slide down the tempo of the next track to
meet the current.  Instead, I wanted the behaviour where all tracks play at their native rate, but "rate match" when the crossfade starts,
and keep track along with beatmatching, so that you get a smooth transition and the next track plays at its original tempo.

Assumes 2 decks with AutoDJ enabled and all tracks have been analysed to get their individual BPM.  
The script only operates during a crossfade between 2 tracks, so isn't polling constantly wasting CPU.  

When AutoDJ loads the next track and starts to crossfade, the script immediately sets the incoming track (next deck) to the current deck's rate/speed.
So they both play at the same rate. The script then slowly increases (or decreases) the tempo of both tracks to reach the target speed of the next deck's track.
The script maintains pitch during rate changes and checks for beat alignment, adjusting beat as necessary.

### Recommended AutoDJ / mixxx settings
1. Main Mixxx window - "Duration of transition": 15 seconds.  Anything will work, but this seems reasonable.  

2. Options -> Decks ->  
		a) Slider range: 90%.  This allows the most variation between BPM of tracks  
    b) Reset on track load: Key/Pitch (checked)  
		c) Reset on track load: Speed/Tempo (checked)  
		d) Sync mode: Use steady tempo  

If you are playing Mixxx over VNC/Remote desktop and encounter CPU peaks/audio stutters, increase:  
`Options -> Sound hardware -> Audio buffer: 92.9msec`  
(Note: the above is not due to this script, but just general latency/load)  

### System setup (Linux users)
1. Ensure you have a virtual midi controller loaded.  This requires a kernel module load.  Create a file:  
`/etc/modules-load.d/snd_virmidi.conf`  
containing:  
`snd_virmidi`  

2. Create a file:  
`/etc/modprobe.d/snd-virmidi.conf`  
containing:  
`options snd-virmidi enable=1 midi_devs=1`  

(the above creates just 1 midi virtual controller)  
... and reboot your machine (or run "modprobe snd_virmidi" if you want to load immediately with 4 midi controllers)  

3. Copy the .js and adjacent *.xml into your user's configuration directory, usually under /home/<user>, eg: ~/.mixxx/controllers  

4. (Re)start Mixxx.  Go into: Options -> Controllers.  You should see a "VirMIDI 1-0" controller.  
In the "Load Mapping" you should see "beatItAutoDJ" in the list (if you copied the .js and .xml files correctly above).  
Select beatItAutoDJ and click "Enabled"  

### Activating
5. Start/Enable AutoDJ.  When tracks transition they should auto align and maintain a beat match.  You can click the "Trigger transition to next track" button (right next to the on/off AutoDJ buton) to force transition to the next track  
