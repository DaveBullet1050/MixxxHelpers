# MixxxHelpers
Add on controllers or tips for running [Mixxx](https://mixxx.org/) - a virtual DJ console.

[beatiItAutoDJ](./beatItAutoDJ/README.md) - Auto tempo and beat matching during AutoDJ transitioning, from current deck tempo to next deck so that the incoming deck plays at the original track tempo.  Also supports sending beat signals to lighting software and a DB to configure whether the track should use full/half beat for the beat marker for light pulses.  
[Sending a command to Mixxx](./remoteCommands/README.md) - How to remotely send a key press to Mixxx, allowing remote control of functions (simpler than via MIDI controllers, OSC or other RPC mechanisms).  
## Minimum hardware
I use an Intel i5-6500T with 8Gb RAM and Sata SSD. I've had no issues playing Mixxx with this including QLC+ for lighting control on the same machine (Arch Linux 7.0 without realtime priority enabled).
