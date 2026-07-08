var beatItAutoDJ = {};

function beatItAutoDJ() {}

/*
	beatItAutoDJ
	License: GPLv2 or GPLv3, at your discretion and risk
	 Author: Dave Bullet, 2026-07-08
	    	Credit to: Sophia Herzog, 2016-2017, Stephen Larroque, 2021 (original script and lowbass transition option)
	 Change history:
	 	v0.1 - 2026-06-30 - Initial version
		v0.2 - 2026-07-02 - Added bpm tolerance to skip tracks not in bpmTolerance range (with a max number of skips)
							so it doesn't loop forever
		v0.3 - 2026-07-03 - Resync beats on first crossfade movement (rather than wait) and resyncs every 3 cycles (smoother)
						  - Beat syncing switches from incoming to outgoing channel, so any changes aren't as audible as it is fading out
						  - Tweaked beatsync bands to be exactly in the middle
						  - Added bass boost (disabled by default) to help bass "weak" tracks as was common in the 70s and 80s
		v0.4 - 2026-07-08 - Added beatMatch flag to allow user to turn on / off beatmatching during crossfade
						  - Lengthened time for bass boost and reduced max limit to 2.0
						  - Cut high and mid frequencies to 0.75 (1.0 is default centre/flat) if rolloffMidHigh = true
						  - improved beatmatch logic to minimise the beat shift in the closest direction
	 Mixxx version: v.2.5.6
	 Repo: https://github.com/DaveBullet1050/MixxxHelpers

	Overview:
	---------
	Assumes 2 decks with AutoDJ enabled and all tracks have been analysed to get their individual BPM.
	The script only operates during a crossfade between 2 tracks, so isn't polling constantly wasting CPU.
	
	When AutoDJ loads the next track and starts to crossfade, the script immediately sets the incoming track (next deck) to the current deck's rate/speed.
	So they both play at the same rate. The script then slowly increases (or decreases) the tempo of both tracks to reach the target speed of the next deck's track.
	The script maintains pitch during rate changes and checks for beat alignment, adjusting beat as necessary.

	This script does contain user changeable behaviour.  Change variable values under the section:
	// User Variables
	below

	Changes to this script are dynamic in Mixxx.  Save and Mixxx instantly reloads.
	
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

	This script assumes every track has BPM metadata.  To do this, 
	Make sure you analyse every track in your AutoDJ playlist (or your full your library.
	You can do this by selecting all tracks (in AutoDJ list or full library) without a BPM value and 
	right click -> Analyse -> Analyse)

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
// ==============
// You can change these at any time. Saving this file will automatically trigger a reload by Mixxx (i.e 
// no need to restart Mixxx)
var bpmTolerance = 8;		// +/- difference in BPM between adjacent tracks.  If the next track is outside this range
							// it is skipped, loading the next track (in the hope it is closer).
							// A good number is probably 8 - 12
							// Set this to zero if you don't to skip any tracks (i.e. play in order loaded, regardles of how big a bpm jump there is between)
var maxBpmToleranceSkips = 5;	// Only if bpmTolerance > 0, how many tracks will be skipped to find a close enough bpm tolerance track, before just
								// grabbing the next one (a crude way to stop infinite skipping)
var beatMatch = true;			// If true, will initially beat match then continue to tune during transition. Otherwise no beat matching (just tempo/rate matching)
var bassChangeRate = 0.01;     // Decide how fast the bass knob should turn left on the current deck
							// while transitioning.  Sounds cleaner than 2 tracks playing bass beats
							// even though they are beat matched.  0.01 provides a gradual roll off
							// for a 15 second crossfade / transition
                                    // 0.0 Does not turn left at all (i.e. both tracks full bass levels during transition)
                                    // 1.0: Turns to the far left instantly
                                    // Unit: Float; Range: 0.0 to 1.0; Default: 0.01
var bassBoost = false;		// If true, analyses the incoming track and increases the bass level only
							// if peak VU meter on the incoming track <= 0.75
var maxBassBoost = 2.0;		// Max EQ ("L" knob) setting if bassBoost enabled (and track has low enough peak VU)
							// This is just a safety limit to ensure it doesn't crank "L" to the max leading to clipping/distortion
var rolloffMidHigh = false;	// Flat mid and high frequencies can be bright / harsh for DJ setups, to take these down slightly if true

// User settings end here.  Venture below at your peril :)

// Developer help
var debug = false;			// Set to true to see console output (Developer Tools -> Log from menu or ~/.mixxx/mixxx.log)
/*
	Start mixxx with:
	mixxx --developer
	in order to view the Options -> Developer Tools to view any script errors / log (or tail -f ~/.mixxx/mixxx.log)
	Developer mode is NOT require for normal use (just debugging!)
*/

// Working globals - don't change/edit these
var crossFaderConnection, channel1TrackLoaded, channel2TrackLoaded
var fadingActive = false;
var remainingIterations = 0, recheckBeat = 0;
var beatDelta;
var currDeck, nextDeck, currChannel, nextChannel, ndRateRange, cdRateRange, fadeProgress, fOrB, isEvaluating;
var ndRateDelta, ndNewRate, cdRateDelta, cdNewRate, cdBeatDistance, ndBeatDistance, phaseGap, currSkips;
var cdFileBPM, ndFileBPM, ndTargetRate, ndRateStepSize, cdTargetRate, cdRateStepSize, fadeStart;
var currChannelEq,checkTrackLoadedTimer, bassZeroed, trackLoaded, cdFilterLow;
var mainChannel, adjChannel, nextChannelEq, currVuMeter, maxVuMeter, boostCounter, applyBoostId = 0;
var bassBoostInit, setBassAndMonitor, ndFilterLow, maxBassToSet, midHighLevel, firstBpmAdjust;

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

	// Check if mid and high rolloff wanted, and apply:
	(rolloffMidHigh) ? midHighLevel = 0.75 : midHighLevel = 1.0;
	engine.setValue("[EqualizerRack1_[Channel1]_Effect1]", "parameter2", midHighLevel);
	engine.setValue("[EqualizerRack1_[Channel1]_Effect1]", "parameter3", midHighLevel);
	engine.setValue("[EqualizerRack1_[Channel2]_Effect1]", "parameter2", midHighLevel);
	engine.setValue("[EqualizerRack1_[Channel2]_Effect1]", "parameter3", midHighLevel);

	// Our script will beat match during the crossfade between decks.  Register the event, that way we do not waste CPU
	// inbetween and have to check status etc... Mixxx will only call this when the cross fader is actually moved
	crossFaderConnection = engine.makeConnection("[Master]", "crossfader", beatItAutoDJ.onCrossFade);

	// 1. Listen for whenever a track finishes loading onto Deck 1 or Deck 2, so we disable things
	// that AutoDJ will interfere with (We want total control!)
    channel1TrackLoaded = engine.makeConnection("[Channel1]", "track_loaded", beatItAutoDJ.onTrackLoaded);
    channel2TrackLoaded = engine.makeConnection("[Channel2]", "track_loaded", beatItAutoDJ.onTrackLoaded);
};

beatItAutoDJ.shutdown = function() { // Called by Mixxx - cleanup engine connections gracefully
	crossFaderConnection.disconnect();
	channel1TrackLoaded.disconnect();
	channel2TrackLoaded.disconnect();
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
		currChannelEq = "[EqualizerRack1_[Channel" + currDeck + "]_Effect1]";
		nextChannel = "[Channel"+nextDeck+"]";
		nextChannelEq = "[EqualizerRack1_[Channel" + nextDeck + "]_Effect1]";

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
		recheckBeat = 0;
		bassBoostInit = false;
		if (applyBoostId !== 0) engine.stopTimer(applyBoostId);
		applyBoostId = 0;
		firstBpmAdjust = true;
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

	// Only do this every 3 movements of the crossfader (easier on the CPU!) and beat matching is enabled
	if (beatMatch && recheckBeat <= 0) {
		recheckBeat = 3;
		// Snap the beat of the incoming track to the current

		// We'll start adjusting the next channel, but after halfway, we'll align the current channel
		// so we adjust the channel that is lesser in volume (making any glitches less obvious)

		// Check if over halfway
		if ((fadeStart * value) > 0 ) {
			// Under half way, alter next deck
			mainChannel = currChannel;
			adjChannel = nextChannel;
		} else {
			// Over half way, alter current deck
			mainChannel = nextChannel;
			adjChannel = currChannel;
		}
		// Check the relative beat distance between channels/decks
		cdBeatDistance = engine.getValue(mainChannel, "beat_distance");
		ndBeatDistance = engine.getValue(adjChannel, "beat_distance");

		phaseGap = ndBeatDistance - cdBeatDistance;

		// Choose the closest native beat fraction jump based on the gap size
    	// Options include: 0.03125 (1/32 beat), 0.0625 (1/16), 0.125 (1/8), 0.25 (1/4), 0.5 (1/2)

		// Sometimes when beats are very close one track the phase reference can be nearly a "whole beat" ahead or behind
		// so we normalise it to within 1/2 a beat and "flip" the phase adjustment.  This stops large > 0.7 phase adjustments in the wrong direction
		if (Math.abs(phaseGap) > 0.625) {
			// Shift the phase closer to zero by 1/2 a beat
//			beatItAutoDJ.debug("phaseGap raw: " + phaseGap);
			// If we are closer to the next beat, then reduce the jump by shifting a smaller beat step in the opposite direction
			if (phaseGap > 0) {
				fOrB = "forward";
				phaseGap = phaseGap - 1;
			} else {
				fOrB = "backward";
				phaseGap = 1 + phaseGap;
			}
//			beatItAutoDJ.debug("phaseGap adjusted: " + phaseGap);
		} else {
			// Otherwise, we are within ~1/2 a beat so just pull the other track back (if advanced) or forward (if behind)
			fOrB = (phaseGap > 0) ? "backward" : "forward";
//			beatItAutoDJ.debug("phaseGap close: " + phaseGap);
		} 

		phaseGap = Math.abs(phaseGap);
		switch (true) {
			case (phaseGap > 0.375):
        		engine.setValue(adjChannel, "beatjump_0.5_" + fOrB, 1);				
				break;
			case (phaseGap > 0.1875):
        		engine.setValue(adjChannel, "beatjump_0.25_" + fOrB, 1);				
				break;
			case (phaseGap > 0.09375):
        		engine.setValue(adjChannel, "beatjump_0.125_" + fOrB, 1);				
				break;
			case (phaseGap > 0.0468):
        		engine.setValue(adjChannel, "beatjump_0.0625_" + fOrB, 1);				
				break;
			case (phaseGap >= 0.01):
        		engine.setValue(adjChannel, "beatjump_0.03125_" + fOrB, 1);				
				break;
		}
		firstBpmAdjust = false;
	}
	recheckBeat --;

	// FADE OUT CURRENT TRACK BASS
	// ===========================
	if (!bassZeroed && bassChangeRate > 0) {
		cdFilterLow = engine.getValue(currChannelEq, "parameter1");
		if (cdFilterLow > 0) {
			if (cdFilterLow - bassChangeRate < 0) {
				engine.setValue(currChannelEq, "parameter1", 0)
				bassZeroed = true;
			} else {
				// If bassBoost is on, the current track may be boosted more, so we'll increase the rolloff rate by
				// the max boost value
				engine.setValue(currChannelEq, "parameter1", cdFilterLow - (((cdFilterLow > 1.0) ? 2 : 1) * bassChangeRate));
			}
		}
	}

	// BASS BOOST (IF ENABLED)
	// =======================
	// Check if the incoming track has a peak main meter reading < 0.7, if so, "bump" up the bass.
	// We start this midfade to give the incoming track time to "ramp up" a bit, so we don't overindex the bass
	if (bassBoost && !bassBoostInit && ((fadeStart * value) < 0)) {
		beatItAutoDJ.debug("bass boost analysis starting...");
		bassBoostInit = true;
		if (applyBoostId !== 0) engine.stopTimer(applyBoostId);
		boostCounter = 0;
		maxVuMeter = 0;
		maxBassToSet = 0;
		setBassAndMonitor = false;
		applyBoostId = engine.beginTimer(50, beatItAutoDJ.applyBassBoost);
	}

	// Check if crossfader has reached the other side. If so, reset fading and bass level for next track change
	fadingActive = Math.abs(value) == 1 ? false : true;
	if (!fadingActive && bassChangeRate > 0) {
		engine.setValue(currChannelEq, "parameter1", 1);
	}
}

beatItAutoDJ.applyBassBoost = function() {
	boostCounter++;

	// After commencing, check the levels of the channel vu_meter for the incoming track
	if (boostCounter < 200) {
		currVuMeter = engine.getValue(nextChannel, "vu_meter");
		if (currVuMeter > maxVuMeter) maxVuMeter = currVuMeter;
	} else if (boostCounter < 400) {
		// After 10 seconds, check the max vu meter. We'll use a proportional ramp up as long as the peak
		// VU isn't already 0.75, otherwise it's deemed the track has enough bass, so leaves the default 1.0 setting
		// on the "L" EQ control
		// We'll allow up to 10 seconds to effect the ramp up
		if (!setBassAndMonitor) {
			beatItAutoDJ.debug("maxVuMeter after 5 seconds: " + maxVuMeter);
			setBassAndMonitor = true;
			if (maxVuMeter <= 0.8) {
//				maxBassToSet = ((0.75 - maxVuMeter) / 0.20) * maxBassBoost;
				maxBassToSet = ((0.80 - maxVuMeter) / 0.20) * maxBassBoost;
				if (maxBassToSet > maxBassBoost) maxBassToSet = maxBassBoost;
				beatItAutoDJ.debug("maxBassToSet: " + maxBassToSet);
			}
		}
		ndFilterLow = engine.getValue(nextChannelEq, "parameter1");
		if (maxBassToSet > ndFilterLow  && (boostCounter % 2 === 0)) {
			engine.setValue(nextChannelEq, "parameter1", ndFilterLow + bassChangeRate);
		}
	} else {
		if (applyBoostId !== 0) engine.stopTimer(applyBoostId);
		beatItAutoDJ.debug("bass boost ended");
		applyBoostId = 0;
	}
}

beatItAutoDJ.getPlayingChannel = function() {
    if (engine.getValue("[Channel1]", "play") === 1) return "[Channel1]";
    if (engine.getValue("[Channel2]", "play") === 1) return "[Channel2]";
    return null; // Return null if everything is paused
};

beatItAutoDJ.getWaitingChannel = function(playingChannel) {
	return (playingChannel == currChannel) ? nextChannel : currChannel;
}

beatItAutoDJ.checkBpmAndSkip = function(playingChannel, waitingChannel, checkCount) {
	var currentBpm = engine.getValue(playingChannel, "file_bpm");
	var upcomingBpm = engine.getValue(waitingChannel, "file_bpm");
	beatItAutoDJ.debug("currentBpm: " + currentBpm);
	beatItAutoDJ.debug("upcomingBpm: " + upcomingBpm);

    // If Mixxx hasn't populated the track loaded file_bpm yet, defer execution and check again
    if ((upcomingBpm == cdFileBPM) && (currentBpm == ndFileBPM)) {
        checkCount++;
        if (checkCount < 15) { // Timeout safety gate (roughly 450ms total)
            
            // Mixxx's engine.beginTimer supports passing arguments to the callback function!
            engine.beginTimer(30, function() {
                beatItAutoDJ.checkBpmAndSkip(playingChannel, waitingChannel, checkCount);
            }, true);
            
        } else {
            beatItAutoDJ.debug("Match Timeout. No metadata found. Safety unlocking.");
        }
        return;
    }

    // See if the new track is within bpmToleranec
    var bpmDiff = Math.abs(currentBpm - upcomingBpm);
    if (bpmDiff <= bpmTolerance) {
        beatItAutoDJ.debug("Match found! Loaded " + upcomingBpm + " BPM against " + currentBpm + " BPM.");
        currSkips = 0; 
		isEvaluating = false; // Lift lock for next transition window
        return;
    }

    // CIRCUIT BREAKER PROTECTION
    if (currSkips >= maxBpmToleranceSkips) {
		beatItAutoDJ.debug("Beyond tolerance and run out of skips.");
        currSkips = 0; // Reset for next transition window
        isEvaluating = false;
        return;
    }

    // FAILURE SUB-ROUTINE
    beatItAutoDJ.debug("Rejecting " + upcomingBpm + " BPM (Diff: " + bpmDiff.toFixed(1) + "). Against " +
			currentBpm + " BPM. Issuing skip sequence....");
    currSkips++;

    // Shift skip execution out of the current synchronous thread stack frame
    engine.beginTimer(20, function() {
        engine.setValue("[AutoDJ]", "skip_next", 1);
        
        // Release lock strictly *after* Mixxx handles data array processing
        engine.beginTimer(30, function() {
            isEvaluating = false;
        }, true);
    }, true);
	// Store the BPMs for the tracks just loaded. We'll use them to ensure if this is called again
	// we wait until they change (confirming new track load is complete for BPM diff comparison)
	cdFileBPM = upcomingBpm;
	ndFileBPM = currentBpm;
}

/**
 * Event listener that intercepts Auto DJ right as a track lands on a deck.
 */
beatItAutoDJ.onTrackLoaded = function(value, group, key) {
    // Prevent thread collision if we are already handling a skip lifecycle
	if ((value !== 1) ||  isEvaluating || (bpmTolerance == 0) || !nextChannel || !currChannel) return;

	isEvaluating = true;
	beatItAutoDJ.checkBpmAndSkip(nextChannel, currChannel, 0);
}
