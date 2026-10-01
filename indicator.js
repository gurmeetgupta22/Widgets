import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const Indicator = GObject.registerClass(
{
    GTypeName: 'WidgetsIndicator',
    Signals: {
        'open-gallery': {},
        'toggle-edit-mode': {},
        'toggle-lock': {},
        'toggle-visibility': {},
        'open-settings': {},
    },
},
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Widgets Indicator');

        const icon = new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        this._buildMenu();
    }

    _buildMenu() {
        // Add Widgets
        const addWidgetItem = new PopupMenu.PopupMenuItem('Add Widgets (Gallery)...');
        addWidgetItem.connect('activate', () => this.emit('open-gallery'));
        this.menu.addMenuItem(addWidgetItem);

        // Edit Mode
        this.editModeItem = new PopupMenu.PopupMenuItem('Edit Mode (Drag & Arrange)');
        this.editModeItem.connect('activate', () => this.emit('toggle-edit-mode'));
        this.menu.addMenuItem(this.editModeItem);

        // Lock Positions Switch
        this.lockItem = new PopupMenu.PopupSwitchMenuItem('Lock Positions', false);
        this.lockItem.connect('toggled', () => this.emit('toggle-lock'));
        this.menu.addMenuItem(this.lockItem);

        // Toggle Visibility
        const visItem = new PopupMenu.PopupMenuItem('Toggle Widgets On/Off');
        visItem.connect('activate', () => this.emit('toggle-visibility'));
        this.menu.addMenuItem(visItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Preferences
        const settingsItem = new PopupMenu.PopupMenuItem('Preferences...');
        settingsItem.connect('activate', () => this.emit('open-settings'));
        this.menu.addMenuItem(settingsItem);
    }

    setLockState(isLocked) {
        if (this.lockItem)
            this.lockItem.setToggleState(isLocked);
    }
});
