# Boss Cube II Web Control - Version History

## Version 2.23.0 (2025-07-10)

### 🎯 **Major Interface Improvements & Live Performance Enhancements**

This stable release brings significant interface improvements, enhanced mobile experience, and comprehensive Live Performance mode enhancements based on user feedback and extensive testing.

### ✨ **What's New for Users**

#### 🔁 **Redesigned Looper Interface**
- **Compact single-row layout**: All 6 looper control buttons now fit in one horizontal line, saving ~60% vertical space
- **Clearer button labels**: Added descriptive text under each icon (Erase, Paused, Record, Play, Overdub, Standby)
- **Settings modal**: Recording Time control moved to dedicated settings modal (⚙️ gear icon) for cleaner interface
- **Instant visual feedback**: Buttons change color immediately when clicked, no waiting for device response
- **Mobile optimization**: Perfect touch-friendly sizing for phones and tablets

#### 🎭 **Enhanced Live Performance Mode**
- **Improved mobile experience**: Fixed drag & drop preset reordering on touch devices
- **Long hold parameter selection**: 800ms hold duration with haptic feedback for instant pedal control assignment
- **Better visual feedback**: Fixed red pedal position indicator persistence and proper cleanup
- **Touch handling improvements**: Removed unwanted browser highlighting and scrolling interference
- **Professional mobile interface**: Optimized for stage use with reliable touch interactions

#### 📱 **Mobile & Touch Improvements**
- **Responsive looper design**: 4-button assign layout adapts perfectly from desktop to mobile
- **Enhanced touch events**: Proper prevention of browser default behaviors during interactions
- **Visual feedback fixes**: Eliminated light blue tap highlighting and improved control state display
- **Better drag operations**: Smooth preset reordering with visual placeholders during drag

### 🛠️ **Behind-the-Scenes Improvements**
- **Cleaner code organization**: Separated HTML templates, CSS styles, and JavaScript for better maintainability
- **Template system**: Modular HTML components with variable substitution for easier customization
- **Organized file structure**: Dedicated `styles/` and `templates/` folders for better project organization
- **Comprehensive documentation**: Complete pickup mode documentation with technical guides and JSDoc comments
- **Performance optimizations**: Improved template loading and caching system

### 🎨 **User Experience Enhancements**
- **Less visual clutter**: Recording time moved to settings since it's rarely changed
- **Color-coded states**: Green for active, gray for inactive across all looper controls
- **Consistent behavior**: All controls provide immediate visual feedback for better responsiveness
- **Professional appearance**: Streamlined interface designed for both studio and live performance use

### 📈 **Impact**
This release makes Boss Cube Web Control significantly more professional and mobile-friendly. The redesigned looper interface is more compact and intuitive, while Live Performance mode now works reliably on mobile devices for confident stage use. The organized codebase improves maintainability for future development.

**Upgrading from v2.22.14**: Enjoy a cleaner, more compact interface with better mobile support. Recording Time is now in the settings modal (⚙️), and Live Performance mode works great on mobile devices.

---

## Version 2.22.14 (2025-07-07)

### 🧪 **Testing & Quality Assurance**

This release focused on comprehensive testing infrastructure and quality assurance to ensure reliable Boss Cube communication and pedal integration.

### ✨ **What's New**

#### 🧪 **Comprehensive Test Suite**
- **Pedal Communication Tests**: 15 comprehensive tests covering BLE MIDI parsing, value validation, and button detection
- **Boss Cube Controller Tests**: 10 tests ensuring sequential parameter reading and GATT operation management
- **SysEx Communication Tests**: 7 tests validating Boss Cube protocol parsing and multi-packet handling
- **Total Coverage**: 32 automated tests preventing regressions in critical communication functions

#### 🔧 **Reliability Improvements**
- **Fixed "Read Values" functionality**: Restored sequential parameter reading with proper timing
- **Enhanced GATT operation management**: Prevents "operation already in progress" errors
- **Improved Boss Cube communication**: Better handling of parameter reads and writes
- **Looper notification fixes**: Proper button highlighting when Boss Cube sends status updates

#### 🛠️ **Technical Infrastructure**
- **Automated CI/CD testing**: GitHub Actions pipeline for continuous integration
- **Browser test runner**: Interactive test interface for manual verification
- **Headless testing**: Automated testing using Puppeteer for CI/CD environments
- **Manual hardware testing**: Real device testing tools for "Read Values" functionality

### 📈 **Impact**
This release establishes a solid foundation for future development with comprehensive testing that prevents communication regressions and ensures reliable Boss Cube control.

---

## Version 2.22.1 (2025-07-07)

### 🎵 **Professional Tuner & Looper Integration**

Major enhancements focusing on tuner interface and looper functionality.

### ✨ **What's New**

#### 🎛️ **Enhanced Tuner Controls**
- **Visual tuner display**: Frequency and note detection with pitch meter visualization
- **Frequency preset buttons**: Quick selection buttons for different tuning standards
- **Reference key selection**: Chromatic tuning support for alternate tunings
- **Professional interface**: Enhanced tuning workflow optimized for live performance

#### 🔁 **Complete Looper Integration**
- **Complete looper interface**: All looper controls with visual state feedback
- **Real-time status**: Automatic button highlighting based on Boss Cube looper state
- **One-click operation**: Simple loop recording and playback workflow
- **Visual feedback**: Color-coded button states show current looper operation

---

## Version 2.17.7 (2025-07-06)

### 🎛️ **Extended Controls & Bind Mode**

Significant expansion of parameter control and advanced features.

### ✨ **What's New**

#### 🔧 **More Parameter Controls**
- **Extended parameter access**: Additional mixer and effects parameters
- **Master bind mode**: Advanced parameter linking functionality
- **Enhanced tuner**: Improved tuning interface and controls
- **Better parameter organization**: Logical grouping of related controls

---

## Version 2.16.1 (2025-07-06)

### ⚙️ **Settings & Effect Control**

Enhanced settings management and effect control systems.

### ✨ **What's New**

#### 🎛️ **Effect Control System**
- **Advanced effect switching**: Improved effect parameter management
- **Settings interface**: Comprehensive settings management UI
- **Enhanced control organization**: Better grouping of effect parameters

---

## Version 2.13.2 (2025-07-06)

### 🚀 **Core Functionality Established**

Foundational release with working pickup mode and parameter reading.

### ✨ **Core Features**

#### 🎛️ **Complete Mixer Interface**
- **All Boss Cube II parameters**: Master, Mic/Instrument, Guitar/Mic, Aux/Bluetooth, i-CUBE LINK volumes
- **Effects control system**: Guitar and Mic/Inst effects with automatic switching
- **EQ controls**: Bass, Middle, Treble, Gain for both Guitar and Mic/Inst channels
- **Shared reverb**: Type, Time, Pre-Delay, Low Cut, High Cut, Density controls

#### 🦶 **EV-1-WL Pedal Integration**
- **Dual Bluetooth connections**: Boss Cube + EV-1-WL pedal simultaneously
- **Expression control**: Any mixer/effects parameter controllable via pedal
- **Footswitch navigation**: Left/Right footswitches cycle through parameters
- **Pickup mode**: Seamless pedal position synchronization prevents parameter jumps
- **Visual feedback**: Orange highlighting shows active pedal control

#### 📱 **Progressive Web App**
- **Mobile installation**: Install on phones and tablets for portable control
- **Cross-platform**: Works on Chrome/Edge across Windows, Linux, Android
- **Touch-optimized**: Responsive design for phones, tablets, and desktop
- **Wake lock support**: Prevents screen sleep during performances

#### 🔧 **Technical Foundation**
- **Web Bluetooth implementation**: Direct Boss Cube communication using reverse-engineered SysEx
- **BLE MIDI integration**: EV-1-WL pedal connectivity via Bluetooth Low Energy
- **Real-time synchronization**: Bidirectional parameter communication with Boss Cube
- **Physical knob detection**: Responds to hardware control changes

---

## 🔬 **Development Methodology**

### **Reverse Engineering Foundation**
Boss Cube Web Control is built on comprehensive reverse-engineering of the Boss Cube II SysEx protocol through:

1. **Bluetooth HCI Analysis** - Capturing communication between official Boss Tone Studio app and Boss Cube II
2. **SysEx Protocol Mapping** - Documenting parameter addresses, value ranges, and command formats  
3. **Web Bluetooth Implementation** - Translating protocol knowledge into web-based control interface
4. **Community Validation** - Testing and verification by Boss Cube II users

Based on the [Boss Cube Street II SysEx project](https://github.com/PetrDlouhy/street-cube-II-sysex) documentation.

---

## 📊 **Feature Evolution Timeline**

| Version | Release Date | Focus Area | Key Features |
|---------|--------------|------------|--------------|
| **2.13.2** | Jul 6, 2025 | Foundation | Core SysEx implementation, dual Bluetooth, pickup mode, parameter reading |
| **2.16.1** | Jul 6, 2025 | Effects | Settings management, effect control systems, parameter organization |
| **2.17.7** | Jul 6, 2025 | Extended Controls | More parameters, bind mode, enhanced tuner interface |
| **2.22.1** | Jul 7, 2025 | Tuner & Looper | Professional tuner interface, complete looper integration |
| **2.22.14** | Jul 7, 2025 | Quality Assurance | Comprehensive testing, reliability improvements, code refactoring |
| **2.23.0** | Jul 10, 2025 | Interface & Mobile | Looper redesign, Live Performance enhancements, mobile optimization |

---

## 🎯 **Platform Support**

| Platform | Chrome | Edge | Firefox | Safari | Notes |
|----------|--------|------|---------|--------|-------|
| Windows  | ✅     | ✅   | ❌      | ❌     | Web Bluetooth required |
| Linux    | ✅     | ✅   | ❌      | ❌     | Web Bluetooth required |
| Android  | ✅     | ✅   | ❌      | ❌     | PWA installation supported |
| iOS      | ❌     | ❌   | ❌      | ❌     | Web Bluetooth not available |

**Requirements**: Web Bluetooth API support (Chrome 56+, Edge 79+)

---

*For detailed technical documentation, see README.md. For current development plans, see TASKS.md.* 