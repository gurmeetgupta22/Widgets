import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { BaseWidget } from './BaseWidget.js';

const _uid = Date.now().toString(36);

export const BluetoothWidget = GObject.registerClass(
{
    GTypeName: `WidgetsBluetoothWidget_${_uid}`,
},
class BluetoothWidget extends BaseWidget {
    _init(settings) {
        super._init('bluetooth', 'Bluetooth', 'bluetooth-active-symbolic', 'medium', settings);

        this._timerId = 0;
        this._buildUI();
        this._updateBluetoothDevices();

        // Check for device updates every 4 seconds
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
            this._updateBluetoothDevices();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _buildUI() {
        this.devicesBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
        });

        this.emptyLabel = new St.Label({
            text: 'No Devices Connected',
            style_class: 'bt-empty-label',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this.devicesBox.add_child(this.emptyLabel);

        this.bodyBox.add_child(this.devicesBox);
    }

    _getDeviceIcon(name, iconType) {
        const lower = name.toLowerCase();
        if (lower.includes('headphone') || lower.includes('buds') || lower.includes('airpod') || lower.includes('wh-') || lower.includes('wf-') || lower.includes('ear'))
            return 'audio-headphones-symbolic';
        if (lower.includes('mouse'))
            return 'input-mouse-symbolic';
        if (lower.includes('keyboard'))
            return 'input-keyboard-symbolic';
        if (lower.includes('speaker') || lower.includes('sound'))
            return 'audio-speakers-symbolic';
        if (lower.includes('phone') || lower.includes('iphone') || lower.includes('galaxy') || lower.includes('pixel'))
            return 'phone-symbolic';
        if (lower.includes('controller') || lower.includes('gamepad') || lower.includes('xbox') || lower.includes('dualshock'))
            return 'input-gaming-symbolic';
        return 'bluetooth-active-symbolic';
    }

    _updateBluetoothDevices() {
        // Run bluetoothctl devices Connected
        const proc = Gio.Subprocess.new(
            ['bluetoothctl', 'devices', 'Connected'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (obj, res) => {
            try {
                const [, stdout] = obj.communicate_utf8_finish(res);
                this._renderDeviceList(stdout || '');
            } catch (e) {
                // If bluetoothctl fails, keep empty
                this._renderDeviceList('');
            }
        });
    }

    _renderDeviceList(output) {
        const lines = output.trim().split('\n').filter(l => l.startsWith('Device '));

        this.devicesBox.destroy_all_children();

        if (lines.length === 0) {
            this.emptyLabel = new St.Label({
                text: 'No Connected Devices',
                style_class: 'bt-empty-label',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                y_expand: true,
            });
            this.devicesBox.add_child(this.emptyLabel);
            return;
        }

        // Show up to 3 connected devices
        for (let i = 0; i < Math.min(lines.length, 3); i++) {
            const line = lines[i];
            const parts = line.split(' ');
            const mac = parts[1];
            const name = parts.slice(2).join(' ') || 'Bluetooth Accessory';

            const itemBox = new St.BoxLayout({
                style_class: 'bt-device-item',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const icon = new St.Icon({
                icon_name: this._getDeviceIcon(name),
                icon_size: 16,
                margin_right: 8,
                y_align: Clutter.ActorAlign.CENTER,
            });
            itemBox.add_child(icon);

            const nameLabel = new St.Label({
                text: name,
                style_class: 'bt-device-name',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            itemBox.add_child(nameLabel);

            const statusLabel = new St.Label({
                text: '● Connected',
                style_class: 'bt-device-status',
                y_align: Clutter.ActorAlign.CENTER,
            });
            itemBox.add_child(statusLabel);

            this.devicesBox.add_child(itemBox);
        }
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        super.destroy();
    }
});
