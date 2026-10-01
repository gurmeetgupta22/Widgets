import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Indicator } from './indicator.js';
import { WidgetGallery } from './gallery.js';

export default class WidgetsExtension extends Extension {
    async enable() {
        const _t = Date.now();
        const { WidgetManager, AVAILABLE_WIDGETS } = await import(`./widgetManager.js?t=${_t}`);
        this._availableWidgets = AVAILABLE_WIDGETS;

        this._settings = this.getSettings();
        this._widgetManager = new WidgetManager(this._settings);
        this._gallery = null;

        this._indicator = new Indicator();
        this._indicator.setLockState(this._settings.get_boolean('lock-positions'));

        this._indicator.connect('open-gallery', () => {
            if (this._gallery) {
                this._gallery.close();
                this._gallery = null;
            }
            this._gallery = new WidgetGallery(this._availableWidgets);
            this._gallery.connect('add-widget', (_actor, widgetId) => {
                this._widgetManager.addWidget(widgetId);
            });
            this._gallery.open();
        });

        this._indicator.connect('toggle-edit-mode', () => {
            const isEditing = this._widgetManager.toggleEditMode();
            if (isEditing) {
                Main.notify('Widgets: Edit Mode', 'Drag widgets to rearrange or click ✕ to remove. Click top bar icon to finish.');
            }
        });

        this._indicator.connect('toggle-lock', () => {
            const locked = this._widgetManager.toggleLock();
            this._indicator.setLockState(locked);
        });

        this._indicator.connect('toggle-visibility', () => {
            this._widgetManager.toggleVisibility();
        });

        this._indicator.connect('open-settings', () => {
            this.openPreferences();
        });

        if (Main.panel.statusArea[this.uuid]) {
            try {
                Main.panel.statusArea[this.uuid].destroy();
            } catch (_) {}
            delete Main.panel.statusArea[this.uuid];
        }
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._gallery) {
            this._gallery.close();
            this._gallery.destroy();
            this._gallery = null;
        }

        if (this._widgetManager) {
            this._widgetManager.destroy();
            this._widgetManager = null;
        }

        this._settings = null;
    }
}
