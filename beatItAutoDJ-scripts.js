var beatItAutoDJ = {};

function beatItAutoDJ() {}

/*
	beatItAutoDJ
	License: GPLv2 or GPLv3, at your discretion and risk
	 Author: Dave Bullet, 2026-06-30
	    	Credit to: Sophia Herzog, 2016-2017, Stephen Larroque, 2021 (original script and lowbass transition option)
	 Script version: v0.1
	 Mixxx version: v.2.5.6

	Overview:
	---------
	Assumes 2 decks with AutoDJ enabled and all tracks have been analysed to get their individual BPM.
	The script only operates during a crossfade between 2 tracks, so isn't polling constantly wasting CPU.
	
	When AutoDJ loads the next track and starts to crossfade, the script immediately sets the incoming track (next deck) to the current deck's rate/speed.
	So they both play at the same rate. The script then slowly increases (or decreases) the tempo of both tracks to reach the target speed of the next deck's track.
	The script maintains pitch during rate changes and checks for beat alignment, adjusting beat as necessary.

	Changes to this script are dynamic in Mixxx.  Save and Mixxx instantly reloads.  Start mixxx with:
	mixxx --developer
	in order to view the Options -> Developer Tools to view any script errors / log (or tail -f ~/.mixxx/mixxx.log)
	Developer mode is NOT require for normal use (just debugging!)

	Recommended AutoDJ / mixxx settings:
	------------------------------------
	Duration of transition: 15 seconds.  Anything will work, but this seems reasonable.

	Options -> Decks ->
		Slider range: 90%.  This allows the most variation between BPM of tracks
		Reset on track load: Key/Pitch (checked)
		Reset on track load: Speed/Tempo (checked)
		Sync mode: Use steady tempo

	If you are playing Mixxx over VNC/Remote desktop and encounter CPU peaks/audio stutters, increase:
	Options -> Sound hardware -> Audio buffer: 92.9msec
	(Note: the above is not due to this script, but just general latency/load)

	System setup (Linux users):
	------------------------
	1. Ensure you have a virtual midi controller loaded.  This requires a kernel module load.  Create a file:
	/etc/modules-load.d/snd_virmidi.conf

	containing:
	snd_virmidi

	2. Create a file:
	/etc/modprobe.d/snd-virmidi.conf 

	containing:
	options snd-virmidi enable=1 midi_devs=1

	(the above creates just 1 midi virtual controller)
	... and reboot your machine (or run "modprobe snd_virmidi" if you want to load immediately with 4 midi controllers)

	3. Copy this script (and adjacent) *.xml into your user's configuration directory, usually under /home/<user>, eg: ~/.mixxx/controllers

	4. (Re)start Mixxx.  Go into: Options -> Controllers.  You should see a "VirMIDI 1-0" controller.
	In the "Load Mapping" you should see "beatItAutoDJ" in the list (if you copied the .js and .xml files correctly above).
	Select beatItAutoDJ and click "Enabled"

	Activating:
	-----------
	5. Start/Enable AutoDJ.  When tracks transition they should auto align and maintain a beat match.  You can click the "Trigger transition to next track"
	button (right next to the on/off AutoDJ buton) to force transition to the next track
*/

// User Variables
var bassChangeRate = 0.01;     // Decide how fast the bass knob should turn left on the current deck
							// while transitioning.  Sounds cleaner than 2 tracks playing bass beats
							// even though they are beat matched.  0.01 provides a gradual roll off
							// for a 15 second crossfade / transition
                                    // 0.0 Does not turn left at all (i.e. both tracks full bass levels during transition)
                                    // 1.0: Turns to the far left instantly
                                    // Unit: Float; Range: 0.0 to 1.0; Default: 0.01
var debug = false;

// Working globals
var crossFaderConnection, deck1Connection, deck2Connection;
var fadingActive = false;
var remainingIterations = 0, recheckBeat = 0;
var currDeck, nextDeck, currChannel, nextChannel, ndRateRange, cdRateRange, fadeProgress, fOrB;
var ndRateDelta, ndNewRate, cdRateDelta, cdNewRate, cdBeatDistance, ndBeatDistance, phaseGap;
var cdFileBPM, ndFileBPM, ndTargetRate, ndRateStepSize, cdTargetRate, cdRateStepSize, fadeStart;

beatItAutoDJ.init = function() {
	// Initialise the script.  Enable options to help beat matching
	engine.setValue("[Channel1]", "sync_enabled", 0);
	engine.setValue("[Channel2]", "sync_enabled", 0);
	engine.setValue("[Channel1]", "quantize", 1);
	engine.setValue("[Channel2]", "quantize", 1);
	engine.setValue("[Channel1]", "keylock", 1.0);
	engine.setValue("[Channel2]", "keylock", 1.0);
	engine.setValue("[Channel1]", "keylockMode", 0.0);
	engine.setValue("[Channel2]", "keylockMode", 0.0);

	// Our script will beat match during the crossfade between decks.  Register the event, that way we do not waste CPU
	// inbetween and have to check status etc... Mixxx will only call this when the cross fader is actually moved
	crossFaderConnection = engine.makeConnection("[Master]", "crossfader", beatItAutoDJ.onCrossFade);

	// 1. Listen for whenever a track finishes loading onto Deck 1 or Deck 2, so we disable things
	// that AutoDJ will interfere with (We want total control!)
    deck1Connection = engine.makeConnection("[Channel1]", "track_loaded", beatItAutoDJ.onTrackLoaded);
    deck2Connection = engine.makeConnection("[Channel2]", "track_loaded", beatItAutoDJ.onTrackLoaded);
};

beatItAutoDJ.shutdown = function() { // Called by Mixxx - cleanup engine connections gracefully
	crossFaderConnection.disconnect();
	deck1Connection.disconnect();
    deck2Connection.disconnect();
};

beatItAutoDJ.debug = function(message) {
	if (debug) console.debug(message);
}

beatItAutoDJ.onCrossFade = function(value, group, key) {
//	beatItAutoDJ.debug("crossfade: " + value);
	if (!fadingActive) {
		// First time at start of the crossfade.
		// Determine the current deck being faded from.  <0 is the left deck, >= 0 is the right
		currDeck = value < 0 ? 1 : 2;
		nextDeck = currDeck == 1 ? 2 : 1;
		beatItAutoDJ.debug("currDeck: " + currDeck);
		beatItAutoDJ.debug("nextDeck: " + nextDeck);
		currChannel = "[Channel"+currDeck+"]";
		nextChannel = "[Channel"+nextDeck+"]";

		// Used to determine the relative rate increase/decrease to apply below (as a percentage away from fade start)
		fadeStart = value < 0 ? -1.0 : 1.0;

		// Get the speeds of the files loaded in each deck
		cdFileBPM = engine.getValue(currChannel, "file_bpm");
		ndFileBPM = engine.getValue(nextChannel, "file_bpm");
		beatItAutoDJ.debug("currDeck BPM: " + cdFileBPM);
		beatItAutoDJ.debug("nextDeck BPM: " + ndFileBPM);

		// Calculate the total % shift in rate required to bring the target BPM down to match the current BPM.  We need
		// to offset this by the rate range being set on the deck (via Options -> Decks -> Slider range) to find
		// the correct relative rate value to the degree of slider movement.  90% in the Mixxx options allows the greatest BPM difference between tracks
		ndRateRange = engine.getValue(nextChannel, "rateRange");
//		beatItAutoDJ.debug("ndRateRange: " + ndRateRange);
		ndTargetRate = -1 * ((cdFileBPM - ndFileBPM) / ndFileBPM / ndRateRange);

		// Keep within the bounds of the control
		if (ndTargetRate > 1.0) ndTargetRate = 1.0;
		if (ndTargetRate < -1.0) ndTargetRate = -1.0;
		beatItAutoDJ.debug("ndTargetRate: " + ndTargetRate);

		cdRateRange = engine.getValue(currChannel, "rateRange");
//		beatItAutoDJ.debug("cdRateRange: " + cdRateRange);
		cdTargetRate = -1 * ((ndFileBPM - cdFileBPM) / cdFileBPM / cdRateRange);
		if (cdTargetRate > 1.0) cdTargetRate = 1.0;
		if (cdTargetRate < -1.0) cdTargetRate = -1.0;
		beatItAutoDJ.debug("cdTargetRate: " + cdTargetRate);

		// Align the next deck to the current deck speed since the current deck has the dominant volume (start of fade).
		// We'll then slowly increase/decrease the rate of both decks (toward the target) as the crossfader moves
		engine.setValue(nextChannel, "rate", ndTargetRate);
		bassZeroed = false;
	}

	// RATE RAMP UP / DOWN SECTION - BOTH DECKS
	// ========================================

	// Work out % through the fade.  We'll use this to work out what rate we need to be add for each deck
	fadeProgress = Math.abs(value - fadeStart) / 2.0;

	// For standard Mixxx configuration, a positive rate (toward 1.0) is a slower tempo, whereas
	// negative rate (toward -1.0) is faster

	// Adjust next deck rate - we're heading to zero from the initially set target rate
	ndRateDelta = fadeProgress * ndTargetRate;
	// Whether the target rate is negative (faster) or positive (slower), subtracting a delta will head to zero
	ndNewRate = ndTargetRate - ndRateDelta;
	engine.setValue(nextChannel, "rate", ndNewRate);
//	beatItAutoDJ.debug("ndNewRate: " + ndNewRate);

	// Repeat for current deck, we'll slide this along with the next deck so they match tempo/rate
	// For the current deck, we start at a zero rate, and head (up or down) to match the next deck
	cdRateDelta = fadeProgress * cdTargetRate;
	// Whether the rate is negative (go faster) or positive (slow down), adding the delta will head to target rate
	cdNewRate = 0 + cdRateDelta;	
	engine.setValue(currChannel, "rate", cdNewRate);
//	beatItAutoDJ.debug("cdNewRate: " + cdNewRate);

	// BEATMATCH CHECK AND ADJUST SECTION
	// ==================================

	// Only do this every 5 movements of the crossfader (easier on the CPU!)
	if (recheckBeat > 5) {
		recheckBeat = 0;
		// Snap the beat of the incoming track to the current

		// Check the relative beat distance between channels/decks
		cdBeatDistance = engine.getValue(currChannel, "beat_distance");
		ndBeatDistance = engine.getValue(nextChannel, "beat_distance");

		phaseGap = ndBeatDistance - cdBeatDistance;

		// Choose the closest native beat fraction jump based on the gap size
    	// Options include: 0.03125 (1/32 beat), 0.0625 (1/16), 0.125 (1/8), 0.25 (1/4), 0.5 (1/2)
		// The loop following will fine tune and track beat matching through both channels being rate adjusted to the target track
		fOrB = (phaseGap > 0) ? "backward" : "forward";

		phaseGap = Math.abs(phaseGap);
		switch (true) {
			case (phaseGap > 0.375):
        		engine.setValue(nextChannel, "beatjump_0.5_" + fOrB, 1);				
				break;
			case (phaseGap > 0.1875):
        		engine.setValue(nextChannel, "beatjump_0.25_" + fOrB, 1);				
				break;
			case (phaseGap > 0.09375):
        		engine.setValue(nextChannel, "beatjump_0.125_" + fOrB, 1);				
				break;
			case (phaseGap > 0.04):
        		engine.setValue(nextChannel, "beatjump_0.0625_" + fOrB, 1);				
				break;
			case (phaseGap > 0.01):
        		engine.setValue(nextChannel, "beatjump_0.03125_" + fOrB, 1);				
				break;
		}
	}
	recheckBeat ++;

	// FADE OUT CURRENT TRACK BASS
	// ===========================

	if (!bassZeroed && bassChangeRate > 0) {
		cdFilterLow = engine.getValue(currChannel, "filterLow");
		if (cdFilterLow > 0) {
			if (cdFilterLow - this.bassChangeRate < 0) {
				engine.setValue(currChannel, "filterLow", 0)
				bassZeroed = true;
			} else {
				engine.setValue(currChannel, "filterLow", cdFilterLow - bassChangeRate);
			}
		}
	}
	// Check if crossfader has reached the other side. If so, reset fading for next track change
	fadingActive = Math.abs(value) == 1 ? false : true;
	if (!fadingActive && bassChangeRate > 0) {
		engine.setValue(currChannel, "filterLow", 1)
	}
}

/**
 * Event listener that intercepts Auto DJ right as a track lands on a deck.
 */
beatItAutoDJ.onTrackLoaded = function(value, group, key) {
    // value === 1 means a track just finished loading into the target deck group
    if (value === 1) {
        // 2. Kill the sync lock so Auto DJ cannot anchor or manipulate the tempo
        engine.setValue(group, "sync_enabled", 0);
        
        // 3. Instantly reset the pitch slider back to normal absolute 0% speed change
        engine.setValue(group, "rate", 0.0);
    }
}
