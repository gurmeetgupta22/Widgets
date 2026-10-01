import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const AVAILABLE_WIDGETS = [
    { id: 'clock', name: 'Clock & Calendar', description: 'Digital/analog clock with date and time', icon: 'preferences-system-time-symbolic' },
    { id: 'weather', name: 'Weather Forecast', description: 'Live temperature, conditions, and wind', icon: 'weather-few-clouds-symbolic' },
    { id: 'battery', name: 'Battery Level', description: 'Battery percentage, charging state, and time', icon: 'battery-level-100-charged-symbolic' },
    { id: 'bluetooth', name: 'Bluetooth Devices', description: 'Connected accessories and status', icon: 'bluetooth-active-symbolic' },
    { id: 'system', name: 'Activity Monitor', description: 'Real-time CPU, RAM, and disk utilization', icon: 'utilities-system-monitor-symbolic' },
    { id: 'media', name: 'Now Playing', description: 'Media player controls and current track', icon: 'audio-x-generic-symbolic' },
    { id: 'notes', name: 'Desktop Quick Notes', description: 'Quick sticky notes on desktop', icon: 'accessories-text-editor-symbolic' },
    { id: 'appdock', name: 'App Container Dock', description: 'Pin and launch your favourite apps', icon: 'view-grid-symbolic' },
];

export class WidgetManager {
    constructor(settings) {
        this._settings = settings;
        this._widgets = new Map();
        this._trackedWindows = new Map();
        this._editMode = false;
        this._userVisible = true;
        this._sigs = [];
        this._overlapUpdateId = 0;

        this._setupWindowListeners();
        this._setupOverviewListeners();
        this._loadWidgets();
    }

    _setupWindowListeners() {
        // Workspace switch
        this._track(global.workspace_manager, global.workspace_manager.connect('active-workspace-changed', () => {
            this._scheduleOverlapUpdate();
        }));
        this._track(global.workspace_manager, global.workspace_manager.connect('showing-desktop-changed', () => {
            this._scheduleOverlapUpdate();
        }));

        // Window stack / restack changes
        this._track(global.display, global.display.connect('restacked', () => {
            this._scheduleOverlapUpdate();
        }));
        this._track(global.display, global.display.connect('window-created', (_d, win) => {
            this._trackWindow(win);
            this._scheduleOverlapUpdate();
        }));

        // Window manager events
        this._track(global.window_manager, global.window_manager.connect('minimize', () => this._scheduleOverlapUpdate()));
        this._track(global.window_manager, global.window_manager.connect('unminimize', () => this._scheduleOverlapUpdate()));
        this._track(global.window_manager, global.window_manager.connect('size-changed', () => this._scheduleOverlapUpdate()));
        this._track(global.window_manager, global.window_manager.connect('destroy', () => this._scheduleOverlapUpdate()));

        // Track existing windows
        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window ?? actor.get_meta_window?.();
            if (win) this._trackWindow(win);
        }
    }

    _trackWindow(win) {
        if (!win || this._trackedWindows.has(win)) return;
        const sigs = [];
        sigs.push(win.connect('position-changed', () => this._scheduleOverlapUpdate()));
        sigs.push(win.connect('size-changed', () => this._scheduleOverlapUpdate()));
        sigs.push(win.connect('unmanaged', () => {
            this._untrackWindow(win);
            this._scheduleOverlapUpdate();
        }));
        this._trackedWindows.set(win, sigs);
    }

    _untrackWindow(win) {
        const sigs = this._trackedWindows.get(win);
        if (sigs) {
            for (const s of sigs) {
                try { win.disconnect(s); } catch (_) {}
            }
            this._trackedWindows.delete(win);
        }
    }

    _scheduleOverlapUpdate() {
        if (this._overlapUpdateId) return;
        this._overlapUpdateId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._overlapUpdateId = 0;
            this._updateWidgetOverlaps();
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateWidgetOverlaps() {
        // In edit mode, force all widgets visible and interactive so user can drag them
        if (this._editMode) {
            for (const [, widget] of this._widgets) {
                widget.visible = this._userVisible;
                widget.reactive = true;
            }
            return;
        }

        if (!this._userVisible) {
            for (const [, widget] of this._widgets) {
                widget.visible = false;
                widget.reactive = false;
            }
            return;
        }

        const ws = global.workspace_manager.get_active_workspace();
        if (!ws) return;

        // If "Show Desktop" is active, all desktop widgets are visible
        const showingDesktop = global.workspace_manager.showing_desktop ?? false;
        if (showingDesktop) {
            for (const [, widget] of this._widgets) {
                widget.visible = true;
                widget.reactive = true;
            }
            return;
        }

        // Get visible application windows on current workspace
        const windows = ws.list_windows().filter(win => {
            if (!win) return false;
            if (win.minimized || win.is_hidden()) return false;
            const type = win.get_window_type();
            return (type === Meta.WindowType.NORMAL ||
                    type === Meta.WindowType.DIALOG ||
                    type === Meta.WindowType.MODAL_DIALOG ||
                    type === Meta.WindowType.UTILITY);
        });

        for (const [, widget] of this._widgets) {
            const wx = widget.x;
            const wy = widget.y;
            const ww = widget.width > 0 ? widget.width : 170;
            const wh = widget.height > 0 ? widget.height : 170;

            let isCovered = false;
            for (const win of windows) {
                const rect = win.get_frame_rect();
                if (rect.x < wx + ww &&
                    rect.x + rect.width > wx &&
                    rect.y < wy + wh &&
                    rect.y + rect.height > wy) {
                    isCovered = true;
                    break;
                }
            }

            const shouldBeVisible = !isCovered;
            if (widget.visible !== shouldBeVisible) {
                widget.visible = shouldBeVisible;
            }
            widget.reactive = shouldBeVisible;
        }
    }

    _setupOverviewListeners() {
        // Hide widgets in GNOME Shell Activities Overview
        this._track(Main.overview, Main.overview.connect('showing', () => {
            for (const [, widget] of this._widgets) {
                widget.visible = false;
                widget.reactive = false;
            }
        }));
        this._track(Main.overview, Main.overview.connect('hidden', () => {
            this._scheduleOverlapUpdate();
        }));
    }

    _track(obj, id) {
        if (obj && id) {
            this._sigs.push([obj, id]);
        }
    }

    async _loadWidgets() {
        const enabledList = this._settings.get_strv('enabled-widgets');
        let positions = {};
        try {
            positions = JSON.parse(this._settings.get_string('widget-positions'));
        } catch (e) {
            positions = {};
        }

        const monitor = Main.layoutManager.primaryMonitor;
        const screenW = monitor ? monitor.width : 1920;
        let defaultY = 70;
        let defaultX = screenW - 390;

        for (const widgetId of enabledList) {
            if (!positions[widgetId]) {
                positions[widgetId] = { x: defaultX, y: defaultY };
                defaultY += 190;
                if (defaultY > 800) {
                    defaultY = 70;
                    defaultX -= 200;
                }
            }
            await this.addWidget(widgetId, positions[widgetId].x, positions[widgetId].y, false);
        }

        this._scheduleOverlapUpdate();
    }

    async addWidget(id, x = null, y = null, updateSettings = true) {
        if (this._widgets.has(id))
            return;

        const _t = Date.now();
        let widget = null;
        try {
            switch (id) {
                case 'clock': {
                    const { ClockWidget } = await import(`./widgets/ClockWidget.js?t=${_t}`);
                    widget = new ClockWidget(this._settings);
                    break;
                }
                case 'weather': {
                    const { WeatherWidget } = await import(`./widgets/WeatherWidget.js?t=${_t}`);
                    widget = new WeatherWidget(this._settings);
                    break;
                }
                case 'battery': {
                    const { BatteryWidget } = await import(`./widgets/BatteryWidget.js?t=${_t}`);
                    widget = new BatteryWidget(this._settings);
                    break;
                }
                case 'bluetooth': {
                    const { BluetoothWidget } = await import(`./widgets/BluetoothWidget.js?t=${_t}`);
                    widget = new BluetoothWidget(this._settings);
                    break;
                }
                case 'system': {
                    const { SystemWidget } = await import(`./widgets/SystemWidget.js?t=${_t}`);
                    widget = new SystemWidget(this._settings);
                    break;
                }
                case 'media': {
                    const { MediaWidget } = await import(`./widgets/MediaWidget.js?t=${_t}`);
                    widget = new MediaWidget(this._settings);
                    break;
                }
                case 'notes': {
                    const { NotesWidget } = await import(`./widgets/NotesWidget.js?t=${_t}`);
                    widget = new NotesWidget(this._settings);
                    break;
                }
                case 'appdock': {
                    const { AppDockWidget } = await import(`./widgets/AppDockWidget.js?t=${_t}`);
                    widget = new AppDockWidget(this._settings);
                    break;
                }
                default:
                    return;
            }
        } catch (err) {
            logError(err, `Widgets: Failed to instantiate ${id}`);
            return;
        }

        if (!widget) return;

        const monitor = Main.layoutManager.primaryMonitor;
        const screenW = monitor ? monitor.width : 1920;
        const posX = (x !== null) ? x : (screenW - 390);
        const posY = (y !== null) ? y : 80;

        widget.set_position(posX, posY);
        widget.setEditMode(this._editMode);
        widget.visible = this._userVisible;

        widget.connect('position-changed', (_actor, newX, newY) => {
            this._saveWidgetPosition(id, newX, newY);
            this._scheduleOverlapUpdate();
        });

        widget.connect('size-changed', (_actor, newW, newH) => {
            this._saveWidgetSize(id, newW, newH);
            this._scheduleOverlapUpdate();
        });

        widget.connect('remove-requested', () => {
            this.removeWidget(id);
        });

        // Add to Shell chrome so all buttons, inputs, and controls are 100% clickable
        Main.layoutManager.addChrome(widget, {
            affectsStruts: false,
            trackFullscreen: false,
        });

        this._widgets.set(id, widget);

        if (updateSettings) {
            const enabled = this._settings.get_strv('enabled-widgets');
            if (!enabled.includes(id)) {
                enabled.push(id);
                this._settings.set_strv('enabled-widgets', enabled);
            }
            this._saveWidgetPosition(id, posX, posY);
        }

        this._scheduleOverlapUpdate();
    }

    removeWidget(id) {
        const widget = this._widgets.get(id);
        if (widget) {
            try {
                Main.layoutManager.removeChrome(widget);
            } catch (_) {}
            try {
                const parent = widget.get_parent();
                if (parent) parent.remove_child(widget);
            } catch (_) {}
            widget.destroy();
            this._widgets.delete(id);

            const enabled = this._settings.get_strv('enabled-widgets').filter(item => item !== id);
            this._settings.set_strv('enabled-widgets', enabled);
            this._scheduleOverlapUpdate();
        }
    }

    _saveWidgetPosition(id, x, y) {
        let positions = {};
        try {
            positions = JSON.parse(this._settings.get_string('widget-positions'));
        } catch (e) {
            positions = {};
        }
        positions[id] = { x: Math.round(x), y: Math.round(y) };
        this._settings.set_string('widget-positions', JSON.stringify(positions));
    }

    _saveWidgetSize(id, w, h) {
        let sizes = {};
        try {
            sizes = JSON.parse(this._settings.get_string('widget-sizes') || '{}');
        } catch (e) {
            sizes = {};
        }
        sizes[id] = { w: Math.round(w), h: Math.round(h) };
        this._settings.set_string('widget-sizes', JSON.stringify(sizes));
    }

    toggleEditMode() {
        this._editMode = !this._editMode;
        for (const [, widget] of this._widgets) {
            widget.setEditMode(this._editMode);
        }
        this._updateWidgetOverlaps();
        return this._editMode;
    }

    toggleLock() {
        const current = this._settings.get_boolean('lock-positions');
        this._settings.set_boolean('lock-positions', !current);
        return !current;
    }

    toggleVisibility() {
        this._userVisible = !this._userVisible;
        this._updateWidgetOverlaps();
        return this._userVisible;
    }

    destroy() {
        if (this._overlapUpdateId) {
            GLib.source_remove(this._overlapUpdateId);
            this._overlapUpdateId = 0;
        }

        for (const [win, sigs] of this._trackedWindows) {
            for (const s of sigs) {
                try { win.disconnect(s); } catch (_) {}
            }
        }
        this._trackedWindows.clear();

        for (const [obj, id] of this._sigs) {
            try {
                if (obj && typeof obj.disconnect === 'function') {
                    obj.disconnect(id);
                }
            } catch (_) {}
        }
        this._sigs = [];

        for (const [, widget] of this._widgets) {
            try { Main.layoutManager.removeChrome(widget); } catch (_) {}
            try {
                const parent = widget.get_parent();
                if (parent) parent.remove_child(widget);
            } catch (_) {}
            try { widget.destroy(); } catch (_) {}
        }
        this._widgets.clear();
    }
}
