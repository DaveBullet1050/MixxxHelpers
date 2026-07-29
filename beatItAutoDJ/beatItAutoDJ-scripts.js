var beatItAutoDJ = {};

function beatItAutoDJ() {}

/*
	beatItAutoDJ
	License: GPLv2 or GPLv3, at your discretion and risk (but above all, have fun!)
	 Author: Dave Bullet, 2026-07-26
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
		v0.5 - 2026-07-24 - Added ability to enable sending the beat over the active Midi Through channel with a configurable lead time
							to allow for platform specific latencies.
						  - Added all user configuration options to the XML to enable setting via Mixxx UI
		v0.6 - 2026-07-29 - Added half beat support, that is play on the "downbeat" halfway between beats in the beatgrid.  I found
							Mixxx often analysed tracks so the beat grid is on the upbeat, not downbeat.  Can be set via Mixxx UI alongside other settings
						  - Added support for a "track DB" of preferred half or full beat settings (per artist-track).  This is optional, but allows
							the system to switch automatically during the cross fade between half/full beat tracking on a per song basis.  This means you don't
							need to manually re-align beatgrids.  This works via an external shell script, monitoring for Mixxx track change, then looking up the DB
						  - Added another shell script to set the preferred full / half beat alignment for a specific track.  This adds to the "database" and sends an immediate
						    change MIDI signal to this script (for immediate effect).  Can be called via SSH etc.., parameterised with "half" or "full" as desired
						  - Changed beat pulse time to be half the beat duration.  Fast BPM tracks therefore flash quicker than slower ones.
						  - Added a "Skip a beat when track over set BPM", so that every second beat sends a MIDI beat signal for tracks over the specified BPM.  This
						    blends in, based on current effective BPM, analysed during the crossfade
						  - Fixed bass fade and boost so they are decoupled.  Now neither, either or both can be used (previously fade level had to be set to enable boost).
						    Increased fade by order of 10 so in 0.1 increments (not 0.01)

		Tested with Mixxx version: v.2.5.6 and QLC+ 5.2.2

	Overview:
	---------
	Please see README at

	Repo: https://github.com/DaveBullet1050/MixxxHelpers/blob/main/beatItAutoDJ/README.md
*/

// User Variables
// ==============
// You can change these at any time (via the Mixxx UI). Overrides to the .XML values you make via the UI are stored in your ~/.mixxx/mixxx.cfg.
// Read the Github README (link above) for an explanation of each, or hover over the setting in the preferences dialogue for an explanation.

var beatMatch = engine.getSetting("beatMatch");
var bpmTolerance = engine.getSetting("bpmTolerance");
var maxBpmToleranceSkips = engine.getSetting("maxBpmToleranceSkips");
var bassChangeRate = 0.0;
bassChangeRate = Number(engine.getSetting("bassChangeRate"));
var bassBoost = engine.getSetting("bassBoost");
var maxBassBoost = engine.getSetting("maxBassBoost");
var midHighLevel = engine.getSetting("midHighLevel");
var bpmLeadTimeDefault = engine.getSetting("bpmLeadTime");
var skipBeatBpmDefault = engine.getSetting("skipBeatBpm");
var midiChannel = engine.getSetting("midiChannel");
var halfBeatDefault = engine.getSetting("halfBeat");

/*
Default settings when previously script (rather than XML/UI) driven:
var beatMatch = true;		
var bpmTolerance = 0;		
var maxBpmToleranceSkips = 5;
var bassChangeRate = 0.1;
var bassBoost = false;
var maxBassBoost = 2.0;
var midHighLevel = 1.0;
var bpmLeadTime = 100;
var midiChannel = 1;
*/

// User settings end here.  Venture below at your peril :)

// Developer help
var debug = false;			// Set to true to see console output (Developer Tools -> Log from menu or ~/.mixxx/mixxx.log)
/*
	Start mixxx with:
	mixxx --developer
	in order to view the Options -> Developer Tools to view any script errors / log (or tail -f ~/.mixxx/mixxx.log)
	Developer mode is ONLY required if you are using setting bpmLeadTime > 0 to enable lighting software integration (to send MIDI events)
*/

// Working globals - don't change/edit these
let bpmLeadTime = 0;
bpmLeadTime = Number(bpmLeadTimeDefault);
let halfBeat = halfBeatDefault;
let skipBeatBpm = 0;
skipBeatBpm = Number(skipBeatBpmDefault);

var crossFaderConnection, channel1TrackLoaded, channel2TrackLoaded;
var fadingActive = false;
var recheckBeat = 0, skippingBeat;
var currDeck, nextDeck, currChannel, nextChannel, ndRateRange, cdRateRange, fadeProgress, fOrB, isEvaluating;
var ndRateDelta, ndNewRate, cdRateDelta, cdNewRate, cdBeatDistance, ndBeatDistance, phaseGap, currSkips;
var cdFileBPM, ndFileBPM, ndTargetRate, ndRateStepSize, cdTargetRate, cdRateStepSize, fadeStart;
var currChannelEq,checkTrackLoadedTimer, bassReset, trackLoaded, cdLowFilter;
var mainChannel, adjChannel, nextChannelEq, currVuMeter, maxVuMeter, boostCounter, applyBoostId = 0;
var bassBoostInit, setBassAndMonitor, ndFilterLow, maxBassToSet = 0.0, firstBpmAdjust;
var beatProcessed, prevBeatDistance = 0, midiInputHandler, newLowFilter = 0;
var channel1BeatDistance, channel2BeatDistance, beatSlope, beatIntercept, startMarker, endMarker;

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

	// Set mid / high rolloff
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

	if (bpmLeadTime > 0) {
    	channel1BeatDistance = engine.makeConnection("[Channel1]", "beat_distance", beatItAutoDJ.onBeatDistance);
    	channel2BeatDistance = engine.makeConnection("[Channel2]", "beat_distance", beatItAutoDJ.onBeatDistance);
		// For handling notes
		// midiInputHandler = midi.makeInputHandler(0x90, 0x01, beatItAutoDJ.onBeatChange);
	}
};

beatItAutoDJ.shutdown = function() { // Called by Mixxx - cleanup engine connections gracefully
	beatItAutoDJ.debug("shutdown");
	crossFaderConnection.disconnect();
	channel1TrackLoaded.disconnect();
	channel2TrackLoaded.disconnect();

	if (channel1BeatDistance) channel1BeatDistance.disconnect();
	if (channel2BeatDistance) channel2BeatDistance.disconnect();
	if (midiInputHandler) midiInputHandler.disconnect();
};

beatItAutoDJ.debug = function(message) {
	if (debug) console.debug("beatItAutoDJ:: " + message);
}

beatItAutoDJ.onCrossFade = function(value, group, key) {
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
		ndTargetRate = -1 * ((cdFileBPM - ndFileBPM) / ndFileBPM / ndRateRange);

		// Keep within the bounds of the control
		if (ndTargetRate > 1.0) ndTargetRate = 1.0;
		if (ndTargetRate < -1.0) ndTargetRate = -1.0;
		beatItAutoDJ.debug("ndTargetRate: " + ndTargetRate);

		cdRateRange = engine.getValue(currChannel, "rateRange");
		cdTargetRate = -1 * ((ndFileBPM - cdFileBPM) / cdFileBPM / cdRateRange);
		if (cdTargetRate > 1.0) cdTargetRate = 1.0;
		if (cdTargetRate < -1.0) cdTargetRate = -1.0;
		beatItAutoDJ.debug("cdTargetRate: " + cdTargetRate);

		// Align the next deck to the current deck speed since the current deck has the dominant volume (start of fade).
		// We'll then slowly increase/decrease the rate of both decks (toward the target) as the crossfader moves
		engine.setValue(nextChannel, "rate", ndTargetRate);
		bassReset = false;
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

	// Repeat for current deck, we'll slide this along with the next deck so they match tempo/rate
	// For the current deck, we start at a zero rate, and head (up or down) to match the next deck
	cdRateDelta = fadeProgress * cdTargetRate;
	// Whether the rate is negative (go faster) or positive (slow down), adding the delta will head to target rate
	cdNewRate = 0 + cdRateDelta;	
	engine.setValue(currChannel, "rate", cdNewRate);

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
		if (Math.abs(phaseGap) > 0.5) {
			// Shift the phase closer to zero by 1/2 a beat
			// If we are closer to the next beat, then reduce the jump by shifting a smaller beat step in the opposite direction
			if (phaseGap > 0) {
				fOrB = "forward";
				phaseGap = phaseGap - 1;
			} else {
				fOrB = "backward";
				phaseGap = 1 + phaseGap;
			}
		} else {
			// Otherwise, we are within ~1/2 a beat so just pull the other track back (if advanced) or forward (if behind)
			fOrB = (phaseGap > 0) ? "backward" : "forward";
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

	// REDUCE OR FADE BASS (if either is endabled)
	// ===========================================
	if (!bassReset && (bassBoost || (bassChangeRate > 0))) {
		cdLowFilter = engine.getValue(currChannelEq, "parameter1");
		if (cdLowFilter >= 1.0) {
				// If we have fade as well as boost, we'll increase the rolloff rate in the boost range to get through the fade in time
				newLowFilter = cdLowFilter - ((bassChangeRate == 0) ? 0.01 : (bassChangeRate / 10 * 2))
		} else {
				newLowFilter = cdLowFilter - (bassChangeRate / 10);
		}

		if ((newLowFilter < 0) && (bassChangeRate > 0)) {
			newLowFilter = 0;
			bassReset = true;
		}
		if ((newLowFilter < 1.0) && (bassChangeRate == 0)) {
			newLowFilter = 1.0;
			bassReset = true;
		}
		engine.setValue(currChannelEq, "parameter1", newLowFilter);
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
	fadingActive = (Math.abs(value) == 1) ? false : true;
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
		// VU isn't already 0.8, otherwise it's deemed the track has enough bass, so leaves the default 1.0 setting
		// on the "L" EQ control
		// We'll allow up to 10 seconds to effect the ramp up
		if (!setBassAndMonitor) {
			beatItAutoDJ.debug("maxVuMeter after 5 seconds: " + maxVuMeter);
			setBassAndMonitor = true;
			if (maxVuMeter <= 0.8) {
//				maxBassToSet = ((0.75 - maxVuMeter) / 0.20) * maxBassBoost;
				maxBassToSet = ((0.8 - maxVuMeter) / 0.20) * maxBassBoost;
				if (maxBassToSet > maxBassBoost) maxBassToSet = maxBassBoost;
				beatItAutoDJ.debug("maxBassToSet: " + maxBassToSet);
			}
		}
		ndFilterLow = engine.getValue(nextChannelEq, "parameter1");
		if (maxBassToSet > ndFilterLow  && (boostCounter % 2 === 0)) {
			engine.setValue(nextChannelEq, "parameter1", ndFilterLow + 0.01);
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

    // See if the new track is within bpmTolerance
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

beatItAutoDJ.onBeatDistance = function (value, group, control) {
	/*
		I found the "Midi for light" controller script would skip beats when relying on beat_active
		signals for fast (> 150bpm) tracks.  This algorithm instead looks at beat distance and schedules the beat signal to
		be sent with an (optional) configured amount of lead time (which can be < 5msec for immediate play).  This allows for setups where the lighting software
		may be running over a network or similar with unavoidable delay, hence a lead time allow the beat to send ahead of the audio
		reaching the beat, thus achieving "sync".
		
		The timing of this event is pretty much random, ~every 20msec
		So... when we are over halfway (0.4 for a full beat or 0.9 when tracking a half beat), we'll sleep for the bpmLeadTime configured, 
		fire the beat, sleep for a rest interval then turn it off (allowing a pulse duration of half a bar)
	*/
	// Use the primary channel set in the crossfade (if set) so we don't observe both channels triggering a beat during any crossfade
	if (mainChannel && (mainChannel !== group)) return;

	// Work out if we are playing this song to the tracked beat or half beat, as might be the case where the beatgrid is on the upbeat
	// and we want beat pulses on the down(half) beat
	if (halfBeat) {
		value = (0.5 + value) % 1.0;
		//var beatMarker = 0.5;
	} else {
		//var beatMarker = 1.0;
	}

	// We abort if either we've already processed the current beat OR we haven't yet reached the halfway mark to schedule the next beat
	if (beatProcessed || (value < 0.4)) {
		if (value < prevBeatDistance) beatProcessed = false;
		return;
	}

	// Current beat not handled yet and we're over half beat_distance, we need to schedule the beat
	// This ensures we don't keep flashing, and wait until the beat next loops around (back to >= 0.0) for the next beat
	beatProcessed = true;

	// This is so we can track when we loop around and reset for the next beat
	prevBeatDistance = value;

	// Calculate lead time requested
	var currBPM = engine.getValue(group, "bpm");

	// If the current track is over the skipBeatBpm threshold, then see if we are on the skip beat, if so, do nothing
	if ((skipBeatBpm > 0) && (currBPM > skipBeatBpm) && !skippingBeat) {
		skippingBeat = true;
		return;
	}

	var msecsPerBeat = (60 / currBPM * 1000);
	var msecsToNextBeat = msecsPerBeat * (1.0 - value);
	var sleepToBeat = msecsToNextBeat - bpmLeadTime;
/*	beatItAutoDJ.debug("beat_distance :" + value + " bpm: " + currBPM + " bpmLeadTime: " + bpmLeadTime + " msecsPerBeat: " +
					msecsPerBeat + " msecsToNextBeat: " + msecsToNextBeat + " sleepToBeat: " + sleepToBeat +
					" halfBeat: " + halfBeat + " skippingBeat: " + skippingBeat);
*/

	// If the lead time is minimal, play immediately, otherwise sleep!  Either way, we'll send a beat signal, more or less at beat_distance = 1.0
	if (sleepToBeat < 5) {
		var flashDuration = (skippingBeat) ? msecsPerBeat : (msecsPerBeat / 2);
		midi.sendShortMsg(0x8F + midiChannel, 0x32, 0x64); // note D (50) on with value 64

		engine.beginTimer(flashDuration, function() {
			midi.sendShortMsg(0x8F + midiChannel, 0x32, 0x0); // note D (50) on with value 0
			midi.sendShortMsg(0x7F + midiChannel, 0x32, 0x0); // note D (59) off with value 0
		}, true);
	} else {
		var flashDuration = (skippingBeat) ? msecsPerBeat : (msecsPerBeat / 2);
		engine.beginTimer(sleepToBeat, function() {

			midi.sendShortMsg(0x8F + midiChannel, 0x32, 0x64); // note D (50) on with value 64

			// This turns off the note (thus stops the beat signal).  The calculation makes the duration relative to the songs BPM.
			// Fast songs will have a shorter wait period, slower songs will be longer.  The goal is roughly half time on / off per beat
			engine.beginTimer(flashDuration, function() {
				midi.sendShortMsg(0x8F + midiChannel, 0x32, 0x0); // note D (50) on with value 0
				midi.sendShortMsg(0x7F + midiChannel, 0x32, 0x0); // note D (59) off with value 0
			}, true);  // One shot timer
		}, true); // One shot timer
	}
	skippingBeat = false;
}

// Used for incoming midi notes. Not currently implemented
beatItAutoDJ.onBeatChange = function(channel, control, value, status) {
	halfBeat = (value == 0) ? true : false;
	//beatItAutoDJ.debug("incoming midi value: " + value + " halfBeat: " + halfBeat);
}

// Used for incoming sysex hex control strings.  Refer switch_beat.sh and send_midi_signal.sh which trigger the required full/half beat change per track
// sending a MIDI command string to this function
beatItAutoDJ.incomingData = function(data, _length) {
	beatItAutoDJ.debug("incoming midi sysex: " + data + " length: " + _length);

	// Ignore first code (status = 0xF0)

	// First byte = is beat marker to use
	// 0 = use default, 1 = half beat, 2 = full beat (beat grid aligned)
	switch (data[1]) {
		case 0:
			halfBeat = halfBeatDefault;
			break;
		case 1:
			halfBeat = true;
			break;
		case 2:
			halfBeat = false;
			break;
	}
	
	beatItAutoDJ.debug("halfBeat: " + halfBeat);

	// Rest of string (up to last char) is the bpmLeadTime for the track
	var newBpmLead = "";
	for (let i = 2; i < _length - 1; i++) {
		newBpmLead = newBpmLead + data[i];
	}

	if (newBpmLead == "") {
		bpmLeadTime = Number(bpmLeadTimeDefault);
	}
	else {
		bpmLeadTime = Number(newBpmLead);
	}
	beatItAutoDJ.debug("newBpmLead: " + newBpmLead);

/*	// Check if it's our specific Track Title SysEx payload
    // Example Header: [0xF0, 0x00, 0x20, 0x7F]
    if (data[0] === 0xF0 && data[1] === 0x00 && data[2] === 0x20 && data[3] === 0x7F) {
        
        // Extract the characters (ignoring the 4-byte header and 1-byte footer 0xF7)
        var textBytes = data.slice(4, length - 1);
        
        // Convert array of byte integers back to a standard JavaScript string
        var trackTitle = "";
        for (var i = 0; i < textBytes.length; i++) {
            trackTitle += String.fromCharCode(textBytes[i]);
        }
        
        // Success! Your Mixxx script now holds the live track name string natively
        beatItAutoDJ.debug("Mixxx Script Captured Track Name: " + trackTitle);
        
        // Execute your local script conditional logic right here
        if (trackTitle.indexOf("Intro") !== -1) {
             // Do something specific in Mixxx for intro tracks...
        }
    }
		*/
}