# Boss Cube Web Control

**Open-source alternative to the official Boss CUBE Street II Editor app**

A comprehensive Progressive Web App implementing reverse-engineered SysEx protocols to provide complete wireless control over the Boss Cube II amplifier, with technical improvements and additional functionality not available in the official application.

**Current Version:** 2.23.0 ([Release Process](RELEASE_PROCESS.md))

---

## 🔧 **Technical Improvements Over Official Boss App**

### ⚠️ **Official App Technical Limitations**
- **Disruptive UI Behavior** - Long-press triggers numerical edit mode, interrupting real-time control
- **No Pedal Integration** - Missing EV-1-WL pedal support despite using same BLE MIDI protocol
- **Incomplete Parameter Access** - Missing gain control and advanced parameter binding features
- **Desktop-Only Interface** - No mobile/touch-optimized interface for portable use

### ✅ **Technical Solutions Implemented**
- **Direct Parameter Control** - Immediate slider response without disruptive edit modes
- **Dual Bluetooth Architecture** - Simultaneous Boss Cube + EV-1-WL connectivity via BLE MIDI
- **Complete SysEx Implementation** - Full parameter access including all discovered addresses
- **Progressive Web App** - Cross-platform mobile interface with offline capability
- **Advanced Control Features** - Pickup mode, parameter binding, real-time synchronization

---

## 🔧 **Technical Features**

### 🎚️ **Complete Mixer Interface**
- **Master Volume** - Overall amplifier output control
- **Mic/Instrument Volume** - Input channel 1 level
- **Guitar/Mic Volume** - Input channel 2 level  
- **Aux/Bluetooth Volume** - External audio input level
- **i-CUBE LINK Out** - External audio output level

### 🎸 **Guitar Effects & Controls**
- **Guitar EQ** - Bass, Middle, Treble, Gain controls
- **Guitar Amp Types** - Complete amp type selection
- **Guitar Effects** - Phaser, Chorus, Tremolo, T.WAH, Flanger with automatic switching
- **Guitar Delay** - Comprehensive delay controls

### 🎤 **Mic/Instrument Effects & Controls** 
- **Mic/Inst EQ** - Bass, Middle, Treble controls
- **Mic/Inst Effects** - Harmony, Chorus, Phaser, Flanger, Tremolo, T.WAH with automatic switching

### 🌊 **Shared Reverb System**
- **Shared Reverb Controls** - Type, Time, Pre-Delay, Low Cut, High Cut, Density, Knob Assign
- **Separate Reverb Levels** - Independent effect levels for Guitar and Mic/Inst channels

### 🔁 **Looper Controls**
- **Erase Loop** - Clear current loop content
- **Paused** - Pause current loop operation
- **Recording** - Record new loop content
- **Playing** - Playback recorded loop
- **Overdub** - Layer additional audio over existing loop
- **Standby** - Looper ready state

### 🔧 **Looper Settings**
- **Recording Time** - Normal (45s/Stereo) or Long (90s/Mono) recording time
- **Mic/Inst Assign** - Include Mic/Inst input in looper
- **Guitar/Mic Assign** - Include Guitar/Mic input in looper
- **Reverb Assign** - Include reverb effects in looper
- **I-Cube Link/Aux/BT Assign** - Include external audio sources in looper

### 🎵 **Professional Tuner Interface**
- **Visual Tuner Display** - Frequency and note detection
- **Frequency Presets** - Quick selection buttons (435-445Hz)
- **Reference Key Selection** - Chromatic tuning support (C through B)
- **Pitch Parameters** - Fine-tuning controls

### 🎭 **Live Performance Mode**
- **Fullscreen Performance Interface** - Dedicated immersive live control interface
- **Custom Preset Creation** - Build personalized control layouts for different songs/sets
- **Drag & Drop Organization** - Mobile-friendly preset reordering with touch support
- **Long Hold Parameter Selection** - 800ms hold to assign pedal control instantly
- **Advanced Pickup Mode** - Automatic activation for seamless parameter transitions
- **Mobile-Optimized Controls** - Touch-friendly interface designed for stage use
- **Preset Management** - Save, edit, duplicate, and organize performance configurations
- **Fullscreen Lock** - Prevents accidental interface changes during performance

### 🦶 **EV-1-WL Pedal Integration**
- **Dual Bluetooth Connections** - Boss Cube + EV-1-WL simultaneously
- **Any Parameter Control** - Expression pedal controls any mixer/effects parameter
- **Footswitch Navigation** - Left/Right footswitches cycle through parameters
- **Pickup Mode** - Seamless pedal position synchronization
- **Visual Parameter Selection** - Orange highlighting shows active pedal control
- **Touch to Select** - Tap any parameter to assign pedal control

#### **Pickup Mode System**

Pickup mode prevents parameter jumps when pedal position doesn't match control value, ensuring smooth transitions during live performance.

**How It Works:**
- **Detection**: Activates when pedal position differs from control value by >3 units
- **Visual Feedback**: Red line indicator shows current pedal position
- **Control Freeze**: Parameter stays at target value until pedal reaches it
- **Exit Conditions**: Deactivates when pedal reaches target (±3 units) or crosses it

**Activation Scenarios:**
- **Main App**: Manual slider/control changes only
- **Live Performance**: Automatic activation on pedal/control mismatch
- **Parameter Switch**: Auto-activates if new parameter differs from pedal position

**Benefits:**
- **No Parameter Jumps**: Smooth value transitions during parameter switching
- **Live Performance Ready**: Seamless preset/parameter changes mid-performance  
- **Visual Clarity**: Always know where pedal position is relative to control value

### 📱 **Mobile & Performance Features**
- **Progressive Web App** - Install on mobile devices
- **Responsive Design** - Optimized for phones, tablets, and desktop
- **Wake Lock Support** - Prevents screen sleep during performances
- **Master Bind** - Link Master Out to Aux volume knob
- **Real-time Sync** - Bidirectional parameter synchronization
- **Physical Knob Detection** - Responds to hardware control changes

### ⚙️ **Advanced Features**
- **Settings Management** - Customizable pedal CC codes and footswitch polarity
- **Comprehensive Logging** - Detailed connection and parameter change logs
- **Parameter Read/Write** - Full bidirectional communication
- **Effect Switching** - Automatic effect mode activation
- **Value Presets** - Quick 0%, 50%, 100% buttons for all parameters
- **Debug Tools** - Connection testing and parameter validation
---

## 🔧 **Technical Requirements**

### Browser Support
- **Chrome 56+** (recommended)
- **Edge 79+** 
- **Opera 43+**

**Note**: Web Bluetooth is NOT supported in Firefox or Safari.

### Connection Requirements
- **HTTPS required** (or localhost for testing)
- Boss Cube II in **Bluetooth pairing mode** (flashing LED)
- Boss Cube should NOT be connected to system Bluetooth
- EV-1-WL pedal in pairing mode (if using pedal features)

---

## 🚀 **Quick Start Guide**

### 1. Setup Local Server

```bash
# Navigate to project directory
cd boss-cube-web-control

# Choose one option:
# Python 3
python3 -m http.server 8000

# Node.js
npx serve -p 8000

# Python 2  
python -m SimpleHTTPServer 8000
```

### 2. Access via HTTPS

**Method A: ngrok (recommended for mobile)**
```bash
ngrok http 8000
# Use provided HTTPS URL: https://abc123.ngrok.io
```

**Method B: localhost (desktop only)**
```
https://localhost:8000
# Accept security warning
```

### 3. Prepare Hardware

**Boss Cube II:**
1. Power on amplifier
2. Press and hold Bluetooth button until LED flashes
3. Ensure not connected to system Bluetooth

**EV-1-WL Pedal (optional):**
1. Power on pedal
2. Put in Bluetooth pairing mode
3. Ensure not connected to system Bluetooth

### 4. Connect & Control

1. **Open app** in Chrome/Edge via HTTPS URL
2. **Connect Boss Cube** - Click "Connect Boss Cube", select device
3. **Connect Pedal** (optional) - Click "Connect Pedal", select EV-1-WL
4. **Control Parameters** - Use sliders, buttons, or pedal for real-time control

---

## 🎯 **Usage Guide**

### Basic Controls
- **Parameter Sliders** - Direct value control with visual feedback
- **Effect Buttons** - Toggle between effect types (auto-switching)
- **Looper Buttons** - One-click loop recording and playback

### Pedal Control (EV-1-WL)
- **Current Parameter** - Orange highlight shows pedal-controlled parameter
- **Parameter Switching** - Right/Left footswitches OR tap any parameter
- **Expression Control** - Real-time parameter adjustment via pedal movement
- **Pickup Mode** - Automatic position synchronization when switching parameters

### Live Performance Mode
- **Activate Mode** - Click "🎭 Live Performance" button to enter fullscreen mode
- **Create Presets** - Use the gear icon to create custom control layouts
- **Parameter Selection** - Long hold (800ms) any control to assign pedal control
- **Drag & Drop** - Reorder presets by dragging in the preset list
- **Fullscreen Control** - Immersive interface designed for stage use
- **Mobile Optimized** - Touch-friendly controls for phones and tablets

### Basic Live Performance Features
- **Touch to Select** - Tap parameters for instant pedal assignment
- **Visual Feedback** - Clear indication of active controls and values
- **Mobile Support** - Works on phones/tablets for stage-side control
- **Wake Lock** - Screen stays on during performances

---

## 🧪 **Testing & Development**

### Running Tests

This project includes comprehensive unit tests to ensure code quality and prevent regressions, particularly for the critical MIDI parsing functions that handle pedal communication.

**Browser Tests (Interactive):**
```bash
# Start local server
npm start

# Open test runner in browser
https://localhost:8080/test-runner.html
```

**Headless Tests (CI/CD):**
```bash
# Install dependencies
npm install

# Run automated tests
npm test
```

**Manual Testing:**
```bash
# Browser-based test runner
npm run test:browser

# Start development server
npm start

# Manual test for "Read Values" functionality
# Open: https://localhost:8080/manual-test-read-values.html
```

### Test Coverage

The test suite includes:

**🦶 Pedal Communication Tests:**
- **BLE MIDI Parsing** - Multiple messages per packet processing
- **MIDI Byte Validation** - Control/value byte validation (< 0x80)
- **Value Range Validation** - Pedal values must be 0-127
- **Duplicate Filtering** - Prevents duplicate value processing that caused lag
- **Button Press Detection** - Footswitch polarity handling
- **Error Handling** - Unknown CC codes and invalid data
- **Regression Tests** - Specific scenarios that previously caused pedal lag

**🎛️ Boss Cube Controller Tests:**
- **Sequential Parameter Reading** - Prevents GATT operation conflicts
- **Timing Validation** - Ensures proper delays between operations
- **"Read Values" Functionality** - Tests the fixed concurrent operation issue
- **Parameter Categorization** - Mixer, effects, EQ, looper organization
- **Error Handling** - Graceful failure recovery
- **Integration Testing** - End-to-end parameter reading flows
- **Regression Tests** - Ensures no concurrent GATT operations

**🧪 Manual Hardware Testing:**
- **Real Device Testing** - `manual-test-read-values.html` for testing with actual Boss Cube
- **GATT Operation Monitoring** - Real-time verification of sequential reading
- **Performance Measurement** - Timing analysis of parameter reading operations

### Continuous Integration

Tests run automatically on GitHub Actions when you:
- Push to main/master/develop branches
- Create pull requests
- Modify code in the `boss-cube-web-control/` directory

**Test Matrix:**
- Node.js 18.x and 20.x
- Security audits
- Code quality checks
- Automated PR comments with test results

### Development Setup

```bash
# Clone repository
git clone [your-repo-url]
cd boss-cube-web-control

# Install dependencies
npm install

# Start development server with auto-reload
npm start

# Run tests during development
npm test
```

---

## 🏗️ **Architecture**

### Core Technologies
- **Web Bluetooth API** - Direct Boss Cube communication
- **BLE MIDI** - EV-1-WL pedal connectivity  
- **Progressive Web App** - Mobile installation and offline capability
- **Service Worker** - Caching and update management
- **Local Storage** - Settings persistence

### Communication Protocol
- **SysEx Commands** - Roland-standard parameter control
- **BLE MIDI Format** - Timestamped MIDI message wrapping
- **Dual Bluetooth** - Independent Boss Cube and pedal connections
- **Real-time Sync** - Bidirectional parameter state management

### Technical Foundation
This project is built on comprehensive reverse-engineered SysEx documentation from the [Boss Cube Street II SysEx project](https://github.com/PetrDlouhy/street-cube-II-sysex), which provides complete parameter mappings, command formats, and communication protocols discovered through Bluetooth HCI analysis of the official Boss Tone Studio app.

### File Structure
```
boss-cube-web-control/
├── index.html              # Main interface & UI
├── app.js                  # UI logic & event handling  
├── boss-cube-controller.js # Core Bluetooth & parameter logic
├── manifest.json           # PWA configuration
├── sw.js                   # Service worker for caching
├── README.md              # Main documentation
├── PLANNING.md            # High-level vision & goals
├── TASKS.md              # Development roadmap
└── HISTORY.md            # Version history & changelog
```

---

## 🔍 **Troubleshooting**

### Connection Issues
**"No devices found"**
- Boss Cube not in pairing mode (LED should flash)
- Already connected to system Bluetooth
- Bluetooth disabled on device

**"Connection failed"**  
- Boss Cube connected elsewhere (disconnect first)
- Connection timeout (power cycle Cube)
- HTTPS not enabled

**"Service not found"**
- Boss Cube not advertising BLE MIDI
- Restart Cube and try again

### Browser Issues
- **Clear cache** - Ctrl+Shift+Delete  
- **Reset permissions** - Site settings → Reset
- **Try incognito** - Rules out extension conflicts
- **Check console** - F12 → Console for errors

---

## 🔧 **Platform Compatibility**

| Platform | Chrome | Edge | Firefox | Safari | Notes |
|----------|--------|------|---------|--------|-------|
| Windows  | ✅     | ✅   | ❌      | ❌     | Web Bluetooth support required |
| Linux    | ✅     | ✅   | ❌      | ❌     | Web Bluetooth support required |
| Android  | ✅     | ✅   | ❌      | ❌     | Mobile PWA installation supported |
| iOS      | ❌     | ❌   | ❌      | ❌     | Web Bluetooth not implemented |

**Requires Web Bluetooth API support (Chrome 56+, Edge 79+)**

---

## 🤝 **Contributing**

This is an open-source project implementing reverse-engineered SysEx protocols for Boss Cube II control. Areas for contribution include:

- **Protocol Discovery**: Mapping additional SysEx parameters and functions
- **Feature Development**: Implementation of new control features and interfaces
- **Testing**: Cross-platform compatibility and device testing
- **Documentation**: Technical guides and user documentation improvements

See the [Boss Cube Street II SysEx project](https://github.com/PetrDlouhy/street-cube-II-sysex) for protocol documentation and reverse-engineering methodology.

---

## 📄 **License**

This open-source project implements documented SysEx protocols for educational and practical use. Use responsibly and ensure proper volume levels to protect hearing and equipment.

---

*For additional documentation, see PLANNING.md for project vision, TASKS.md for development roadmap, and HISTORY.md for version history.* 