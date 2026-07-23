# beatiItAutoDJ

This MIDI controller script overcomes some issues I was struggling with, with the built in AutoDJ and also MIDI for Lights for beat syncing lighting fixtures.  

By default AutoDJ has a master deck and when sync is enabled, will slide down the tempo of the next track to meet the current.  Instead, I wanted the behaviour where all tracks play at their native rate, but "rate match" when the crossfade starts, and keep track along with beatmatching, so that you get a smooth transition and the next track plays at its original tempo, keeping both songs in beat sync during the fade.  

The script optionally also supports syncing lights via sending a MIDI "beat note".  Whilst Mixxx ships with a "MIDI for Light" script to do the same, I found it failed at higher BPM and wasn't tuneable for any system latencies (especially if you run your fixtures on another device).

## How it works
1. Enable AutoDJ and it will start to play
2. When AutoDJ starts the crossfade to the next song
3. The script starts by setting the incoming track to the same tempo as the outgoing track
4. As the crossfade moves, increases (or decreases) both deck rates (speed/tempo) to slowly move to the target rate of the incoming track
5. Whilst the tempo is moving, also maintains beat matches across both tracks, tuning throughout the fade by slightly bumping initially the incoming track, then outgoing track to align beats
6. Optionally - the script will send a "beat" note on for the song playing on the current deck (prioritising decks during crossfade), so you get a smooth transition for your lighting as well

## Recommended AutoDJ / mixxx settings
Setup Mixxx as follows (tested on v.2.5.6):
1. From the Mixxx window - "Duration of transition": 15 seconds.  Anything will work, but this seems reasonable.
2. Do not bother turning on "master sync" or pitch locking etc.. The script when it initialises will set AutoDJ up as it needs to.
3. Go into menu "Options -> Decks" and set:
		a) Slider range: 90%.  This allows the most variation between BPM of tracks  
    b) Reset on track load: Key/Pitch (checked)  
		c) Reset on track load: Speed/Tempo (checked)  
		d) Sync mode: Use steady tempo  
4. Enable 2 (not 4) decks
5. Ensure all tracks loaded in AutoDJ have BPM values (if not, select the tracks, right click then choose Analyse -> Analyse)
6. Select AutoDJ and then click the "Enabled" box to turn AutoDJ on (will start playing)

## Installation
Mixxx uses MIDI controllers to "plug in" and either operate Mixxx functions or augment them with processing.  The script here is run under a "virtual" MIDI device/controller.  The following steps describe how to setup the controller, install the script (.js and .xml) then select the controller so it is activated.  

First, copy the .js and adjacent *.xml from this repo into your user's configuration directory (On Linux, under /home/your_user, eg: home/your_user/.mixxx/controllers).  

There are 2 ways to setup the script, depending on whether you want just beat matching or beat matching + lighting control (via sending a MIDI signal to software controlling lighting fixtures).  Choose one of the following (the first is the easiest).

### Beatmatching and beat output for lighting - Midi Through Port-0 controller
1. Go into Mixxx Options -> Preferences -> Controllers
2. Select "Midi Through Port-0" and in the drop down, select "beatItAutoDJ"
3. Check the "Enabled" checbox then click "Ok"
4. Start/Enable AutoDJ.  When you start AutoDJ (enable button on the main Mixxx window), both beat matching and a MIDI "beat note" will be sent out the Midi through port  

### Beatmatching only - VirMIDI 1-0 controller

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

3. (Re)start Mixxx.  Go into: Options -> Controllers.  You should see a "VirMIDI 1-0" controller.  
In the "Load Mapping" you should see "beatItAutoDJ" in the list (if you copied the .js and .xml files correctly above).  
Select beatItAutoDJ and click "Enabled"  

4. Start/Enable AutoDJ.  When tracks transition they should auto align and maintain a beat match.  You can click the "Trigger transition to next track" button (right next to the on/off AutoDJ buton) to force transition to the next track  

## User editable parameters
You can either change these via the Options -> Preferences -> Controllers page (selecting the controller you configured above), or hand editing the values in the .js file.  

Open the .js file and you can edit the following (look under the //User Variables heading):

### Beat and track matching specific parameters
| Parameter | Default value | Description |
| :---: | :---: | --- |
| beatMatch | true | If true, adjusts the beat to synchronise along with rate matching from current to next track. If you just want rate (tempo) matching and without beat alignment, set this to false |
| bpmTolerance | 0 | If > 0, this defines the +/- difference allowed in BPM between adjacent tracks.  i.e. if the current track is 127 BPM and next track to play is 137 BPM a bpmTolerance of 10 would match these.  The purpose is to not select tracks with too big a bpm difference.  Although this poses no problem for the script, the speed change may sound funny to listeners.  If set to zero, no BPM comparison is performed (ie. every track is played in order) |
| maxBpmToleranceSkips | 5 | Only applies if bpmTolerance > 0.  This is the maximum number of consecutive tracks that will be skipped outside the bpmTolerance, before aborting and selecting whatever track is next.  This stops infinite loop issues |

### Frequency response customisation
| Parameter | Default value | Description |
| :---: | :---: | --- |
| bassChangeRate | 0.01 | If > 0 = the rate at which the curent track's bass frequencies will be rolled off in the crossfade, allowing the incoming track's bass to dominate.  Having only one track play bass sounds nicer. 0.01 provides a gradual roll off for a 15 second crossfade / transition.  A max value of 1.0 instantly snaps the bass off at the start of crossfade |
| bassBoost | false | If true, the script analyses the incoming track to see if it has sufficient headroom to increase just the bass.  Think of it as "bass normalisation" across tracks.  Some tracks - especially 60s/70s did not mix with an emphasis on bass.  This setting will ramp up the bass gradually to a safe (non-clipping) level after the crossfade, after looking at peak VU (boost only applied if peak vu <= 0.8).  If false, bass is untouched |
| maxBassBoost | 2.0 | Only applies if bassBoost = true.  This is the maximum the "L" knob will be turned if a track has headroom for increasing bass.  This value is a safety to ensure it doesn't get turned too high.  If too much bass is being applied (and you still want some bass boost), reduce this to 1.5 or so |
| midHighLevel | 1.0 | 1.0 = flat.  Adjust this if you want to boost (or reduce) the mid and high frequencies. 0.75 is a good value to try if you find your setup harsh/bright |

### Lighting fixture synchronisation
| Parameter | Default value | Description |
| :---: | :---: | --- |
| bpmLeadTime | 0 | Time (in milliseconds) to send a MIDI beat signal (e.g. to lighting software) "ahead" of the beat. If = 0 - no signal is sent.  If > 0, send a beat signal over the MIDI channel with no latency. If > 5, lead the beat signal by the number of miliseconds.  This allows for any latency due to slow computer or off board  lighting system with latent connection |
| midiChannel | 1 | MIDI channel to send beat information over (only used if bpmLeadTime > 0) |

## Other tips
If you are playing Mixxx over VNC/Remote desktop and encounter CPU peaks/audio stutters, increase:  
`Options -> Sound hardware -> Audio buffer: 92.9msec`  
(Note: the above is not due to this script, but just general latency/load)  

I found that using [real time scheduling](https://github.com/mixxxdj/mixxx/wiki/Adjusting-Audio-Latency) actually caused more glitches.  Instead, increasing audio latency seemed to cure any problems.  The beatAutoDJ script handles changes to audio latency to avoid problems.  
