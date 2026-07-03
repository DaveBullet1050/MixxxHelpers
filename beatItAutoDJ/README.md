# beatiItAutoDJ

This MIDI controller script overcomes some limitations with the built in AutoDJ.  By default AutoDJ has a master deck and when sync is enabled, 
will slide down the tempo of the next track to meet the current.  Instead, I wanted the behaviour where all tracks play at their native rate, but
"rate match" when the crossfade starts, and keep track along with beatmatching, so that you get a smooth transition and the next track plays at 
its original tempo.  

How it works:
1. When AutoDJ is enabled and AutoDJ loads the next (incoming) track
2. When AutoDJ starts the crossfade
3. Sets the incoming track to the same tempo as the outgoing track
4. As the crossfade moves, beat matches both tracks, tuning throughout the fade and increases (or decreases) tempo of the outgoing track to match
   the original speed of the incoming track  

## Recommended AutoDJ / mixxx settings
Setup Mixxx as follows (tested on v.2.5.6):
1. From the Mixxx window - "Duration of transition": 15 seconds.  Anything will work, but this seems reasonable.  
2. Options -> Decks ->  
		a) Slider range: 90%.  This allows the most variation between BPM of tracks  
    b) Reset on track load: Key/Pitch (checked)  
		c) Reset on track load: Speed/Tempo (checked)  
		d) Sync mode: Use steady tempo  
3. Enable 2 (not 4) decks
4. Ensure all tracks loaded in AutoDJ have BPM values (if not, select, right click then choose Analyse -> Analyse)
5. Select AutoDJ and then click the "Enabled" box to turn AutoDJ on (will start playing)

## Installation

### Virtual MIDI Controller setup and script installation
Mixxx uses MIDI controllers to "plug in" and either operate Mixxx functions or augment them with processing.  The script here is run under a "virtual" MIDI device/controller.  The following steps describe how to setup the controller, install the script (.js and .xml) then select the controller so it is activated.  

This assumes you are using Linux:  
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

5. Start/Enable AutoDJ.  When tracks transition they should auto align and maintain a beat match.  You can click the "Trigger transition to next track" button (right next to the on/off AutoDJ buton) to force transition to the next track  

## Options
Open the .js file and you can edit the following (look under the //User Variables heading):
- **bpmTolerance** (default = 0 - off).  If > 0, this defines the +/- difference allowed in BPM between adjacent tracks.  i.e. if the current track is 127 BPM and next track to play is 137 BPM a bpmTolerance of 10 would match these.  The purpose is to not select tracks with too big a bpm difference.  Although this poses no problem for the script, the speed change may sound funny to listeners.  If set to zero, no BPM comparison is performed (ie. every track is played in order)  
- **maxBpmToleranceSkips** (default 5).  Only applies if bpmTolerance > 0.  This is the maximum number of consecutive tracks that will be skipped outside the bpmTolerance, before aborting and selecting whatever track is next.  This stops infinite loop issues  
- **bassChangeRate** (default = 0.01).  If > 0 = the rate at which the curent track's bass frequencies will be rolled off in the crossfade, allowing the incoming track's bass to dominate.  Having only one track play bass sounds nicer. 0.01 provides a gradual roll off for a 15 second crossfade / transition  
- **bassBoost** (default = false).  If true, the script analyses the incoming track to see if it has sufficient headroom to increase just the bass.  Think of it as "bass normalisation" across tracks.  Some tracks - especially 60s/70s did not mix with an emphasis on bass.  This setting will ramp up the bass gradually to a safe (non-clipping) level after the crossfade, after looking at peak VU.  If false, bass is untouched
- **maxBassBoost** (default = 2.5).  Only applies if bassBoost = true.  This is the maximum the "L" knob will be turned if a track has headroom for increasing bass.  This value is a safety to ensure it doesn't get turned too high.  If too much bass is being applied (and you still want some bass boost), reduce this to 2.0 or so

## Other tips
If you are playing Mixxx over VNC/Remote desktop and encounter CPU peaks/audio stutters, increase:  
`Options -> Sound hardware -> Audio buffer: 92.9msec`  
(Note: the above is not due to this script, but just general latency/load)  
