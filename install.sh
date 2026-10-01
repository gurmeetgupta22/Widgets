#!/usr/bin/env bash
set -e

UUID="widgets@desktop.org"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Compiling GSettings schema..."
glib-compile-schemas "$SOURCE_DIR/schemas/"

echo "==> Installing extension to $TARGET_DIR..."
mkdir -p "$HOME/.local/share/gnome-shell/extensions"
rm -rf "$TARGET_DIR"
ln -s "$SOURCE_DIR" "$TARGET_DIR"

echo "==> Enabling extension '$UUID'..."
gnome-extensions enable "$UUID" 2>/dev/null || true

echo "==> Done! If you are on Wayland, log out and log back in (or on X11 press Alt+F2, r, Enter) for GNOME Shell to reload new extensions."
