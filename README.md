# Widgets: macOS-Style Desktop Widgets for GNOME Shell

A modern GNOME Shell extension that brings macOS-inspired desktop widgets directly to your desktop wallpaper layer with frosted glass aesthetics, smooth typography, and real-time live data.

Designed for modern GNOME Shell versions (GNOME 45 through 51+ / Ubuntu 24.04 - 26.04+).

---

## Included macOS-Style Widgets

1. **Clock & Calendar**:
   - Vibrant accent day of week (e.g. `THURSDAY`)
   - Large crisp digital time with AM/PM and glowing seconds
   - Full date display
2. **Weather Forecast**:
   - Real-time live temperature, high/low range
   - Weather condition symbol and description (Clear, Partly Cloudy, Rain, Thunderstorm, etc.)
   - Real-time wind speed and relative humidity
3. **Battery Percentage**:
   - Battery meter with percentage
   - Dynamic charging / discharging badges (`⚡ Charging`, `On Battery`, `Low Battery`, `Full`)
   - Time remaining or time until full
4. **Bluetooth Connected Devices**:
   - Real-time list of connected Bluetooth accessories (Headphones, Mouse, Keyboard, Phone, Controller)
   - Connection status badges
5. **System Activity Monitor**:
   - Real-time CPU load percentage meter
   - RAM memory usage percentage meter
   - Disk space utilization meter
6. **Now Playing Media Player**:
   - Current music/podcast title and artist (via MPRIS)
   - Play/Pause, Next, and Previous controls
7. **Desktop Quick Notes**:
   - Quick sticky notepad on your desktop that auto-saves your notes

---

## Key Features

- **macOS Frosted Glass Styling**: Translucent glass backgrounds (`rgba(28, 28, 32, 0.75)`), subtle specular borders, rounded 24px corners, and soft drop shadows.
- **Direct Desktop Dragging**: Drag and place any widget anywhere on your desktop. Coordinates are automatically remembered.
- **Top Bar Quick Menu**: Access widget options from the top bar:
  - **Add Widgets Gallery**: A macOS-style popup modal to pick and add new widgets.
  - **Edit Mode (Drag & Arrange)**: Shows red ✕ badges to remove widgets and dashed drag borders.
  - **Lock Positions**: Prevents accidental dragging when you are satisfied with your layout.
  - **Toggle Widgets**: Quick hide/show toggle.
  - **Preferences**: Native Libadwaita settings dialog.

---

## Installation

Run the installation script in the extension folder:

```bash
./install.sh
```

Or manually link the folder:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/widgets@desktop.org
glib-compile-schemas schemas/
gnome-extensions enable widgets@desktop.org
```

> **Note on Wayland (Ubuntu default):**
> After installing an extension for the first time, log out and log back in to reload GNOME Shell. Then open the Extensions app or run `gnome-extensions enable widgets@desktop.org`.
