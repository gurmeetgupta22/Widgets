import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const WidgetGallery = GObject.registerClass(
{
    GTypeName: 'WidgetsGallery',
    Signals: {
        'add-widget': {
            param_types: [GObject.TYPE_STRING],
        },
    },
},
class WidgetGallery extends St.Widget {
    _init(widgetDefinitions) {
        super._init({
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: true,
        });

        this.widgetDefinitions = widgetDefinitions;
        this._buildUI();
    }

    _buildUI() {
        // Dimmed backdrop
        this.backdrop = new St.Widget({
            style: 'background-color: rgba(0, 0, 0, 0.55);',
            reactive: true,
            x_expand: true,
            y_expand: true,
        });
        this.backdrop.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });
        this.add_child(this.backdrop);

        // Center modal
        this.modalBox = new St.BoxLayout({
            vertical: true,
            style_class: 'widget-gallery-window',
            reactive: true,
            width: 580,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const headerBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            margin_bottom: 12,
        });

        const titleCol = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });

        const titleLabel = new St.Label({
            text: 'Add Widgets',
            style_class: 'gallery-title',
        });
        titleCol.add_child(titleLabel);

        const subtitleLabel = new St.Label({
            text: 'Choose widgets to pin on your desktop.',
            style_class: 'gallery-subtitle',
        });
        titleCol.add_child(subtitleLabel);
        headerBox.add_child(titleCol);

        const closeBtn = new St.Button({
            label: '✕',
            style_class: 'widget-close-btn',
            reactive: true,
        });
        closeBtn.connect('clicked', () => this.close());
        headerBox.add_child(closeBtn);

        this.modalBox.add_child(headerBox);

        // Scrollable or vertical list of available widgets
        const listContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });

        for (const def of this.widgetDefinitions) {
            const card = new St.BoxLayout({
                vertical: false,
                style_class: 'gallery-card',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const icon = new St.Icon({
                icon_name: def.icon,
                icon_size: 28,
                margin_right: 14,
                y_align: Clutter.ActorAlign.CENTER,
            });
            card.add_child(icon);

            const infoBox = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const name = new St.Label({
                text: def.name,
                style: 'font-weight: bold; font-size: 11pt; color: #ffffff;',
            });
            infoBox.add_child(name);

            const desc = new St.Label({
                text: def.description,
                style: 'font-size: 9.5pt; color: rgba(255, 255, 255, 0.65);',
            });
            infoBox.add_child(desc);
            card.add_child(infoBox);

            const addBtn = new St.Button({
                label: '+ Add',
                style_class: 'gallery-add-btn',
                reactive: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            addBtn.connect('clicked', () => {
                this.emit('add-widget', def.id);
                this.close();
            });
            card.add_child(addBtn);

            listContainer.add_child(card);
        }

        this.modalBox.add_child(listContainer);
        this.add_child(this.modalBox);
    }

    open() {
        const monitor = Main.layoutManager.primaryMonitor;
        this.set_position(monitor.x, monitor.y);
        this.set_size(monitor.width, monitor.height);
        Main.uiGroup.add_child(this);
    }

    close() {
        if (this.get_parent()) {
            this.get_parent().remove_child(this);
        }
    }
});
