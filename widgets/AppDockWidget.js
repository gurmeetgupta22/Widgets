import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import { BaseWidget } from './BaseWidget.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPinnedApps(settings) {
    try {
        const val = settings?.get_string('dock-pinned-apps');
        if (val) {
            const arr = JSON.parse(val);
            if (Array.isArray(arr) && arr.length > 0) return arr;
        }
    } catch (_) {}

    // Default apps if uninitialized
    const defaults = ['code.desktop', 'com.google.Chrome.desktop', 'google-chrome.desktop', 'org.gnome.Nautilus.desktop'];
    const appSys = Shell.AppSystem.get_default();
    const result = [];
    for (const id of defaults) {
        if (appSys.lookup_app(id)) {
            result.push(id);
            if (result.length >= 4) break;
        }
    }
    return result.length > 0 ? result : ['org.gnome.Nautilus.desktop'];
}

function savePinnedApps(settings, ids) {
    try {
        if (settings) {
            settings.set_string('dock-pinned-apps', JSON.stringify(ids));
        }
    } catch (_) {}
}

function getAppInfo(appId) {
    try {
        const app = Shell.AppSystem.get_default().lookup_app(appId);
        if (app) {
            return {
                name: app.get_name() || appId,
                icon: app.get_icon(),
            };
        }
    } catch (_) {}

    try {
        const info = Gio.DesktopAppInfo.new(appId);
        if (info) {
            return {
                name: info.get_name() || appId,
                icon: info.get_icon(),
            };
        }
    } catch (_) {}

    return {
        name: appId.replace('.desktop', ''),
        icon: Gio.ThemedIcon.new('application-x-executable'),
    };
}

function launchApp(appId) {
    try {
        const app = Shell.AppSystem.get_default().lookup_app(appId);
        if (app) {
            app.activate();
            return;
        }
    } catch (_) {}

    try {
        const info = Gio.DesktopAppInfo.new(appId);
        if (info) {
            info.launch([], null);
            return;
        }
    } catch (e) {
        logError(e, 'AppDock: launch error');
    }
}

const _uid = Date.now().toString(36);

// ── Dock Icon Item ────────────────────────────────────────────────────────────

const DockItem = GObject.registerClass(
{
    GTypeName: `WidgetsDockItem_${_uid}`,
    Signals: {
        'remove-requested': {},
    },
},
class DockItem extends St.Button {
    _init(appId) {
        super._init({
            reactive: true,
            track_hover: true,
            can_focus: true,
            style_class: 'dock-icon-wrap',
        });

        this.appId = appId;
        this._editMode = false;
        const meta = getAppInfo(appId);

        const inner = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Icon
        this._icon = new St.Icon({
            gicon: meta.icon || Gio.ThemedIcon.new('application-x-executable'),
            icon_size: 42,
            style_class: 'dock-app-icon',
            x_align: Clutter.ActorAlign.CENTER,
        });
        inner.add_child(this._icon);

        // Short Label
        const displayName = meta.name.length > 9 ? meta.name.slice(0, 8) + '…' : meta.name;
        this._label = new St.Label({
            text: displayName,
            style_class: 'dock-app-label',
            x_align: Clutter.ActorAlign.CENTER,
        });
        inner.add_child(this._label);

        // Remove button (visible only in edit mode)
        this._removeBtn = new St.Button({
            label: '✕',
            style_class: 'dock-remove-badge',
            reactive: false,
            visible: false,
            can_focus: false,
        });
        this._removeBtn.connect('clicked', () => this.emit('remove-requested'));
        inner.add_child(this._removeBtn);

        this.set_child(inner);

        // Launch app on click
        this.connect('clicked', () => {
            if (!this._editMode) {
                launchApp(this.appId);
            }
        });
    }

    setEditMode(enabled) {
        this._editMode = enabled;
        this._removeBtn.visible = enabled;
        this._removeBtn.reactive = enabled;
        this._removeBtn.can_focus = enabled;
    }
});

// ── App Picker Popup Modal ───────────────────────────────────────────────────

const AppPickerModal = GObject.registerClass(
{
    GTypeName: `WidgetsAppPickerModal_${_uid}`,
    Signals: {
        'selected': { param_types: [GObject.TYPE_STRING] },
    },
},
class AppPickerModal extends St.BoxLayout {
    _init(alreadyPinned = []) {
        super._init({
            vertical: true,
            style_class: 'dock-picker-popup',
            reactive: true,
            can_focus: true,
        });

        this._pinnedSet = new Set(alreadyPinned);
        this._buildUI();
    }

    _buildUI() {
        const titleRow = new St.BoxLayout({ vertical: false, x_expand: true });
        titleRow.add_child(new St.Label({
            text: 'Choose an App to Pin',
            style_class: 'dock-picker-title',
            x_expand: true,
        }));
        this.add_child(titleRow);

        const searchEntry = new St.Entry({
            hint_text: 'Search applications...',
            style_class: 'dock-picker-search',
            can_focus: true,
            reactive: true,
        });
        this.add_child(searchEntry);

        const scroll = new St.ScrollView({
            x_expand: true,
            y_expand: true,
            style: 'max-height: 200px; min-height: 160px; margin-top: 8px;',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

        const listCol = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: 'spacing: 3px;',
        });

        const appSys = Shell.AppSystem.get_default();
        const allApps = appSys.get_installed().sort((a, b) =>
            a.get_name().localeCompare(b.get_name())
        );

        const rows = [];
        for (const app of allApps) {
            const id = app.get_id();
            if (this._pinnedSet.has(id)) continue;

            const row = new St.Button({
                style_class: 'dock-picker-row',
                reactive: true,
                can_focus: true,
                x_expand: true,
            });

            const rowInner = new St.BoxLayout({
                vertical: false,
                style: 'spacing: 8px; padding: 5px 8px;',
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
            });

            rowInner.add_child(new St.Icon({
                gicon: app.get_icon() || Gio.ThemedIcon.new('application-x-executable'),
                icon_size: 24,
                y_align: Clutter.ActorAlign.CENTER,
            }));

            rowInner.add_child(new St.Label({
                text: app.get_name(),
                style_class: 'dock-picker-name',
                y_align: Clutter.ActorAlign.CENTER,
            }));

            row.set_child(rowInner);
            row.connect('clicked', () => this.emit('selected', id));

            listCol.add_child(row);
            rows.push({ btn: row, name: app.get_name().toLowerCase() });
        }

        searchEntry.clutter_text.connect('text-changed', () => {
            const q = searchEntry.get_text().toLowerCase().trim();
            for (const item of rows) {
                item.btn.visible = q === '' || item.name.includes(q);
            }
        });

        scroll.add_child(listCol);
        this.add_child(scroll);
    }
});

// ── App Dock Widget ──────────────────────────────────────────────────────────

export const AppDockWidget = GObject.registerClass(
{
    GTypeName: `WidgetsAppDockWidget_${_uid}`,
},
class AppDockWidget extends BaseWidget {
    _init(settings) {
        super._init('appdock', 'App Container', 'view-grid-symbolic', 'medium', settings);

        this._pinned = getPinnedApps(this._settings);
        this._dockItems = new Map();
        this._picker = null;
        this._stageDismissId = 0;

        // Permanent interactivity
        this.reactive = true;
        this.track_hover = true;
        this.can_focus = true;

        // DND drop target registration
        this._delegate = this;

        this._buildUI();
    }

    // ── DND Interface ─────────────────────────────────────────────────────────
    handleDragOver(source, _actor, _x, _y, _xCoord) {
        if (source.app || source instanceof Shell.App || source.id || (source.meta && source.meta.id)) {
            return DND.DragMotionResult.COPY_DROP;
        }
        return DND.DragMotionResult.NO_DROP;
    }

    acceptDrop(source, _actor, _x, _y, _time) {
        let appId = null;
        if (source.app && typeof source.app.get_id === 'function') {
            appId = source.app.get_id();
        } else if (source instanceof Shell.App) {
            appId = source.get_id();
        } else if (source.id) {
            appId = source.id;
        } else if (source.meta && source.meta.id) {
            appId = source.meta.id;
        }

        if (appId) {
            this.pinApp(appId);
            return true;
        }
        return false;
    }

    _buildUI() {
        // Shelf container
        const shelf = new St.BoxLayout({
            vertical: true,
            style_class: 'dock-shelf-container',
            x_expand: true,
            y_expand: true,
        });

        // Scrollable area for icons
        const scroll = new St.ScrollView({
            x_expand: true,
            y_expand: true,
            style_class: 'dock-scroll-area',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

        this._gridContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: 'spacing: 6px; padding: 4px;',
        });
        scroll.add_child(this._gridContainer);
        shelf.add_child(scroll);

        // Empty state hint
        this._emptyHint = new St.Label({
            text: 'Drag apps here or click "+ Add App"',
            style_class: 'dock-empty-hint',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        shelf.add_child(this._emptyHint);

        // Bottom Action Bar with "+ Add App"
        const bottomBar = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            style: 'padding-top: 6px;',
        });

        this._addBtn = new St.Button({
            label: '＋  Add App',
            style_class: 'dock-add-btn',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this._addBtn.connect('clicked', () => this._togglePicker());
        bottomBar.add_child(this._addBtn);
        shelf.add_child(bottomBar);

        this.bodyBox.add_child(shelf);

        this._renderGrid();
    }

    _renderGrid() {
        this._gridContainer.destroy_all_children();
        this._dockItems.clear();

        const COLS = 4;
        let currentRow = null;

        for (let i = 0; i < this._pinned.length; i++) {
            const appId = this._pinned[i];
            if (i % COLS === 0) {
                currentRow = new St.BoxLayout({
                    vertical: false,
                    x_expand: true,
                    style: 'spacing: 6px;',
                });
                this._gridContainer.add_child(currentRow);
            }

            const item = new DockItem(appId);
            item.setEditMode(this._editMode);
            item.connect('remove-requested', () => this._removeApp(appId));
            currentRow.add_child(item);
            this._dockItems.set(appId, item);
        }

        this._emptyHint.visible = (this._pinned.length === 0);
    }

    pinApp(appId) {
        if (!appId || this._pinned.includes(appId)) return;
        this._pinned.push(appId);
        savePinnedApps(this._settings, this._pinned);
        this._renderGrid();
    }

    _removeApp(appId) {
        this._pinned = this._pinned.filter(id => id !== appId);
        savePinnedApps(this._settings, this._pinned);
        this._renderGrid();
    }

    _togglePicker() {
        if (this._picker) {
            this._closePicker();
            return;
        }

        const picker = new AppPickerModal(this._pinned);
        picker.connect('selected', (_src, appId) => {
            this.pinApp(appId);
            this._closePicker();
        });

        const [wx, wy] = this.get_transformed_position();
        const pickerW = Math.max(this.width, 280);
        picker.set_size(pickerW, 260);
        picker.set_position(wx, Math.max(8, wy - 270));

        global.stage.add_child(picker);
        this._picker = picker;

        this._stageDismissId = global.stage.connect('button-press-event', (_stage, event) => {
            if (!this._picker) return Clutter.EVENT_PROPAGATE;
            const [ex, ey] = event.get_coords();
            const [px, py] = this._picker.get_transformed_position();
            const pw = this._picker.width;
            const ph = this._picker.height;
            if (ex < px || ex > px + pw || ey < py || ey > py + ph) {
                this._closePicker();
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _closePicker() {
        if (this._stageDismissId) {
            try { global.stage.disconnect(this._stageDismissId); } catch (_) {}
            this._stageDismissId = 0;
        }
        if (this._picker) {
            try { this._picker.destroy(); } catch (_) {}
            this._picker = null;
        }
    }

    // Always reactive so apps launch directly
    setEditMode(enabled) {
        super.setEditMode(enabled);
        this.reactive = true;
        this.track_hover = true;
        for (const [, item] of this._dockItems) {
            item.setEditMode(enabled);
        }
    }

    destroy() {
        this._closePicker();
        super.destroy();
    }
});
