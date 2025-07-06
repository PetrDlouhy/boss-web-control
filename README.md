# Boss Cube Web Control - Connection Test

A minimal Progressive Web App to test Web Bluetooth connection with Boss Cube II amplifier.

## Features

- ✅ **Full Mixer Interface** - All Boss Cube II parameters in one place
- ✅ **Mixer Controls** - Master, Mic/Instrument, Guitar, Aux, iCube Link volumes
- ✅ **Effects Controls** - Reverb, Chorus, Phaser, Tremolo, T.WAH with levels and switching
- ✅ **EV-1-WL Pedal support** - Control any parameter with expression pedal via Bluetooth
- ✅ **Parameter Switching** - Right/Left footswitches cycle through all parameters
- ✅ **Dual Bluetooth connections** - Boss Cube + EV-1-WL pedal simultaneously
- ✅ **Visual Current Parameter** - Highlighted control shows what pedal controls
- ✅ **Quick Value Buttons** - 0, 50%, Max buttons for each parameter
- ✅ **Click to Select** - Tap any parameter to make it pedal-controllable
- ✅ **Real-time sync** - UI updates instantly with pedal movements
- ✅ **Mobile-responsive design** - Works perfectly on phones and tablets
- ✅ **PWA installable** - Add to home screen on Android

## Requirements

### Browser Support
- **Chrome 56+** (recommended)
- **Edge 79+**
- **Opera 43+**

**Note**: Web Bluetooth is NOT supported in Firefox or Safari.

### Connection Requirements
- **HTTPS required** (or localhost for testing)
- Boss Cube II must be in **Bluetooth pairing mode** (flashing Bluetooth LED)
- Boss Cube should NOT be connected to system Bluetooth

## Quick Start

### 1. Start Local HTTPS Server

```bash
# Navigate to project directory
cd boss-cube-web-control

# Option A: Python 3 (if available)
python3 -m http.server 8000

# Option B: Node.js (if available)
npx serve -p 8000

# Option C: Simple Python 2
python -m SimpleHTTPServer 8000
```

### 2. Access via HTTPS

For Web Bluetooth to work, you need HTTPS. Use one of these methods:

**Method A: Use ngrok (recommended for mobile testing)**
```bash
# Install ngrok if not already installed
# Then run:
ngrok http 8000
```
This gives you an HTTPS URL like `https://abc123.ngrok.io`

**Method B: Use localhost (desktop only)**
- Open: `https://localhost:8000`
- Accept the security warning

**Method C: Chrome flags (desktop only)**
- Go to `chrome://flags/`
- Enable "Insecure origins treated as secure"
- Add `http://localhost:8000` to the list

### 3. Prepare Boss Cube

1. **Power on** your Boss Cube II
2. **Enter Bluetooth mode** - press and hold Bluetooth button until LED flashes
3. **Disconnect from system Bluetooth** if previously paired
4. Keep Cube in discoverable mode (flashing Bluetooth LED)

### 4. Test Connection

1. Open the HTTPS URL in Chrome/Edge
2. Click **"Connect to Boss Cube"**
3. Select your Boss Cube from the device list
4. Watch the log for connection status

### 5. Test Commands

If connection succeeds, try these tests:

- **Master Volume Slider**: Should control amp volume in real-time
- **Mute Button**: Should set volume to 0
- **Unmute Button**: Should set volume to 50%
- **Test Command**: Should set volume to 25%

## Expected Results

### ✅ Success Indicators
- Device appears in Bluetooth picker dialog
- Log shows "Successfully connected to Boss Cube!"
- Status shows "Connected" in green
- Volume controls affect the amplifier
- SysEx commands appear in log

### ❌ Common Issues

**"No devices found"**
- Boss Cube not in pairing mode (LED should flash)
- Boss Cube already connected elsewhere
- Bluetooth disabled on device

**"Connection failed"**
- Boss Cube connected to system Bluetooth (disconnect first)
- Boss Cube paired to phone/tablet (disconnect first)
- Boss Cube timeout (try power cycling)

**"Web Bluetooth not supported"**
- Wrong browser (use Chrome/Edge)
- HTTP instead of HTTPS
- Unsupported platform

**"Service not found"**
- Boss Cube may not be advertising BLE MIDI service
- Try disconnecting from all devices and restarting Cube

## Keyboard Shortcuts

- **C**: Connect/Disconnect
- **Space**: Mute/Unmute toggle
- **T**: Send test command

## Technical Details

### SysEx Commands Sent

The app sends standard Roland SysEx commands:

```
Master Volume: F0 41 10 00 00 00 00 09 12 20 00 00 04 [value] [checksum] F7
```

### BLE MIDI Format

Commands are wrapped in BLE MIDI format:
```
[0x90] [timestamp] [0xF0] [sysex_data] [timestamp] [0xF7]
```

### Web Bluetooth Services Used

- **Service**: `03b80e5a-ede8-4b33-a751-6ce34ec4c700` (BLE MIDI)
- **Characteristic**: `7772e5db-3868-4112-a1a9-f2669d106bf3` (BLE MIDI I/O)

## Mobile Testing (Android)

1. **Use ngrok HTTPS URL** (required for mobile)
2. **Install as PWA**: 
   - Chrome menu → "Add to Home screen"
   - App appears as native app icon
3. **Test on phone**: Same functionality as desktop

## Troubleshooting

### Boss Cube Connection Issues

1. **Power cycle the Boss Cube**
2. **Clear Bluetooth cache**: Settings → Apps → Bluetooth → Storage → Clear Cache
3. **Reset Bluetooth**: Turn off/on device Bluetooth
4. **Check pairing mode**: LED should flash, not solid

### Browser Issues

1. **Clear browser cache**: Ctrl+Shift+Delete
2. **Reset permissions**: Site settings → Reset permissions
3. **Try incognito mode**: Rules out extension conflicts
4. **Check console**: F12 → Console for detailed errors

## Next Steps

If this test works successfully:

1. ✅ Web Bluetooth connection confirmed
2. ✅ SysEx command sending works
3. ✅ Boss Cube responds correctly
4. → Ready to build full mixer interface
5. → Add pedal control (Web MIDI API)
6. → Implement all parameters from Python script

## Files Structure

```
boss-cube-web-control/
├── index.html              # Main interface
├── manifest.json           # PWA manifest
├── boss-cube-controller.js  # Core Bluetooth logic
├── app.js                  # UI interaction handling
└── README.md              # This file
```

## Compatibility

| Platform | Chrome | Edge | Firefox | Safari |
|----------|--------|------|---------|--------|
| Windows  | ✅     | ✅   | ❌      | ❌     |
| Linux    | ✅     | ✅   | ❌      | ❌     |
| Android  | ✅     | ✅   | ❌      | ❌     |
| iOS      | ❌     | ❌   | ❌      | ❌     |

**Web Bluetooth is not supported on iOS devices.**

## 🎛️ **Full Mixer Interface**

The app now provides complete control over all Boss Cube II parameters:

### Mixer Section:
- **Master Volume** - Overall amplifier output
- **Mic/Instrument Volume** - Input channel 1 
- **Guitar/Mic Volume** - Input channel 2
- **iCube Link/Aux/BT Volume** - External audio input
- **iCube Link Out Volume** - External audio output
- **Additional Mixer Channels** - Experimental addresses for discovery

### Effects Section:
- **Guitar Reverb Time** - 0-49 seconds
- **Guitar Reverb Level** - Reverb intensity
- **Guitar Chorus Level** - Chorus effect with automatic mode switching
- **Guitar Phaser Level** - Phaser effect with automatic mode switching  
- **Guitar Tremolo Level** - Tremolo effect with automatic mode switching
- **Guitar T.WAH Level** - Touch-wah effect with automatic mode switching

## 🦶 **Pedal Support (EV-1-WL)**

### Connection:
- **Put your EV-1-WL pedal in Bluetooth pairing mode**
- **Click "Connect Pedal (EV-1-WL)" button** after Boss Cube is connected
- **Select your pedal** from the Bluetooth device picker
- **Green "🎹 Pedal: EV-1-WL" status** indicates successful connection

### Controls:
- **Expression pedal** → Real-time control of currently selected parameter via BLE MIDI
- **Right footswitch** → Next parameter (cycles through all mixer and effects controls)
- **Left footswitch** → Previous parameter

### Features:
- **Any Parameter Control** - Pedal can control Master Vol, Reverb, Chorus, etc.
- **Visual Feedback** - Current parameter highlighted in orange on screen
- **Parameter Cycling** - Footswitches let you switch between all 16 parameters
- **Effect Switching** - Automatically activates effect modes (Chorus, Phaser, etc.)
- **Bidirectional sync** - UI updates instantly when pedal moves
- **Touch to Select** - Tap any parameter on screen to make it pedal-controlled
- **Live performance ready** - Optimized for stage use with clear visual feedback

## 🎯 **Quick Usage Guide**

### Getting Started:
1. **Connect Boss Cube** - Click "Connect Boss Cube", select your CUBE device
2. **Connect Pedal** (optional) - Click "Connect Pedal", select your EV-1-WL 
3. **Control Parameters** - Use sliders, buttons, or pedal to adjust any parameter

### Pedal Control:
1. **Current Parameter** - Shows which parameter the pedal controls (highlighted in orange)
2. **Switch Parameters** - Use right/left footswitches OR tap any parameter on screen
3. **Control Value** - Move expression pedal to adjust the selected parameter
4. **Effect Switching** - Effects automatically activate when selected (Chorus, Phaser, etc.)

### UI Features:
- **Orange Highlight** - Shows current pedal-controlled parameter
- **Real-time Updates** - All controls sync instantly with pedal movements
- **Quick Buttons** - 0, 50%, Max buttons for rapid parameter setting
- **Visual Feedback** - Parameter values update in real-time

### Live Performance Tips:
- **Pre-select Parameters** - Tap parameters you'll need during performance
- **Use Footswitches** - Keep hands free by switching parameters with feet
- **Watch Highlights** - Orange highlighting shows active parameter clearly
- **Mobile Friendly** - Works great on phones and tablets for stage use

---

*This is a test implementation. For production use, add proper error handling, device management, and more Boss Cube parameters.* 