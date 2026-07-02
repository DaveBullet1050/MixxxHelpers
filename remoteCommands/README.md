# Sending a command to Mixxx

On Linux, the easiest way is to map a shortcut key then use SSH to send the keystroke.  For example, say you want to cause AutoDJ to transition to the next track via your phone?  

I use "SSH button" on Android, but any SSH client will do.  

## Dependencies
You'll need the "xdotool" package (on ArchLinux - this is in extra, installed via:   
`pacman -S xdotool`  

You'll also need to enable keyboard shortcuts via the Mixxx UI:  
`Options -> Enable keyboard shortcuts`  

Finally you'll need to find the keyboard shortcut you want to send.  In Mixxx, hover over the control and at the bottom of the tooltop, the shortcut should show, e.g. for AutoDJ transition it's Shift-F11  

## Example
The [transition.sh]() script shows how you can send Shift-F11 using xdotool to find the mixxx app to send the key combo to.  
