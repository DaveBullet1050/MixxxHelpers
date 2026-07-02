# Sending a command to Mixxx

On Linux, the easiest way is to send one of Mixxx's preconfigured shortcut keys via xdotool to the app, which you can call from SSH or a script to send the keystroke.  For example, say you're at a party and sick of the current song and want to cause AutoDJ to transition to the next track via your phone.  

I use "SSH button" on Android, but any SSH client will do.  

## Dependencies
You'll need the "xdotool" package (on ArchLinux - this is in extra, installed via:   
`pacman -S xdotool`  

You'll also need to enable keyboard shortcuts via the Mixxx UI:  
`Options -> Enable keyboard shortcuts`  

Finally you'll need to find the keyboard shortcut you want to send.  In Mixxx, hover over the control and at the bottom of the tooltop, the shortcut should show, e.g. for AutoDJ transition it's Shift-F11  

## Example
The [transition.sh](./transition.sh) script shows how you can send Shift-F11 using xdotool to find the mixxx app to send the key combo to.  A Shift-F11 is the "fade now / transition" function, meaning AutoDJ will begin the crossfade to the other deck.  In my case, my user's X11 session is on display :1.  You may need to change yours to :0.  
