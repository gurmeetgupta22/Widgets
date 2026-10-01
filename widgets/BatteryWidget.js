import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import cairo from 'cairo';
import { BaseWidget } from './BaseWidget.js';

const _uid = Date.now().toString(36);

export const BatteryWidget = GObject.registerClass(
{
    GTypeName: `WidgetsBatteryWidget_${_uid}`,
},
class BatteryWidget extends BaseWidget {
    _init(settings) {
        super._init('battery', 'Battery', 'battery-level-100-charged-symbolic', 'medium', settings);

        this._timerId = 0;
        this._devices = [];
        this._slotCanvases = [];
        this._slotLabels = [];

        this._buildUI();
        this._updateBatteryInfo();

        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._updateBatteryInfo();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _buildUI() {
        // Horizontal container for 4 battery slots
        this.slotsContainer = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'battery-devices-row',
        });

        for (let i = 0; i < 4; i++) {
            const slotBox = new St.BoxLayout({
                vertical: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'battery-slot-box',
            });

            // Circular ring canvas
            const canvas = new St.DrawingArea({
                width: 66,
                height: 66,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            canvas.connect('repaint', (area) => this._drawSlotRing(area, i));
            this._slotCanvases.push(canvas);
            slotBox.add_child(canvas);

            // Percentage label below ring (e.g. "81 %")
            const label = new St.Label({
                text: ' ',
                style_class: 'battery-slot-label',
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._slotLabels.push(label);
            slotBox.add_child(label);

            this.slotsContainer.add_child(slotBox);
        }

        this.bodyBox.add_child(this.slotsContainer);
    }

    _drawSlotRing(area, slotIndex) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        if (w <= 0 || h <= 0) {
            cr.$dispose();
            return;
        }

        const cx = w / 2;
        const cy = h / 2;
        const r = 24;
        const strokeWidth = 5.5;

        cr.save();

        const device = this._devices[slotIndex];

        // 1. Background ring track (dimmed circular placeholder)
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.setLineWidth(strokeWidth);
        cr.setSourceRGBA(1.0, 1.0, 1.0, 0.14);
        cr.stroke();

        if (device && device.percent !== undefined) {
            const pct = Math.max(0, Math.min(100, device.percent));
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + (pct / 100) * 2 * Math.PI;

            // 2. Foreground battery progress arc
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.setLineWidth(strokeWidth);

            if (device.charging || pct > 20) {
                cr.setSourceRGB(0.19, 0.82, 0.35); // Apple Vibrant Green #30d158
            } else if (pct > 10) {
                cr.setSourceRGB(1.0, 0.84, 0.04); // Yellow #ffd60a
            } else {
                cr.setSourceRGB(1.0, 0.27, 0.23); // Red #ff453a
            }

            cr.arc(cx, cy, r, startAngle, endAngle);
            cr.stroke();

            // 3. Charging lightning bolt at top of ring (matching Screenshot 2 slot 2)
            if (device.charging) {
                cr.save();
                cr.translate(cx, cy - r);
                cr.setSourceRGB(0.19, 0.82, 0.35);
                cr.moveTo(1, -7.5);
                cr.lineTo(-4, -0.5);
                cr.lineTo(-0.5, -0.5);
                cr.lineTo(-1.5, 7.5);
                cr.lineTo(4, 0.5);
                cr.lineTo(0.5, 0.5);
                cr.closePath();
                cr.fill();
                cr.restore();
            }

            // 4. Center Device Vector Icon
            this._drawDeviceIcon(cr, cx, cy, device.type);
        }

        cr.restore();
        cr.$dispose();
    }

    _drawDeviceIcon(cr, cx, cy, type) {
        cr.save();
        cr.translate(cx, cy);
        cr.setSourceRGB(1.0, 1.0, 1.0);

        switch (type) {
            case 'phone': {
                // Phone (rounded rectangle with screen outline)
                cr.setLineWidth(1.8);
                const pw = 14, ph = 24, pr = 3.5;
                cr.arc(pw / 2 - pr, -ph / 2 + pr, pr, -Math.PI / 2, 0);
                cr.arc(pw / 2 - pr, ph / 2 - pr, pr, 0, Math.PI / 2);
                cr.arc(-pw / 2 + pr, ph / 2 - pr, pr, Math.PI / 2, Math.PI);
                cr.arc(-pw / 2 + pr, -ph / 2 + pr, pr, Math.PI, 3 * Math.PI / 2);
                cr.closePath();
                cr.stroke();
                // Bottom bar
                cr.moveTo(-3, ph / 2 - 3);
                cr.lineTo(3, ph / 2 - 3);
                cr.stroke();
                break;
            }
            case 'watch': {
                // Apple Watch shape with top & bottom strap lugs
                cr.rectangle(-4.5, -14, 9, 4.5);
                cr.fill();
                cr.rectangle(-4.5, 9.5, 9, 4.5);
                cr.fill();

                const ww = 17, wh = 20, wr = 4.5;
                cr.arc(ww / 2 - wr, -wh / 2 + wr, wr, -Math.PI / 2, 0);
                cr.arc(ww / 2 - wr, wh / 2 - wr, wr, 0, Math.PI / 2);
                cr.arc(-ww / 2 + wr, wh / 2 - wr, wr, Math.PI / 2, Math.PI);
                cr.arc(-ww / 2 + wr, -wh / 2 + wr, wr, Math.PI, 3 * Math.PI / 2);
                cr.closePath();
                cr.setLineWidth(1.8);
                cr.stroke();
                break;
            }
            case 'headphones': {
                // Headphones (headband arc + earcups)
                cr.setLineWidth(1.8);
                cr.arc(0, -1, 10, Math.PI, 0);
                cr.stroke();
                cr.rectangle(-11, -3, 3.5, 8);
                cr.fill();
                cr.rectangle(7.5, -3, 3.5, 8);
                cr.fill();
                break;
            }
            case 'mouse': {
                // Mouse
                cr.setLineWidth(1.8);
                const mw = 14, mh = 22, mr = 6;
                cr.arc(mw / 2 - mr, -mh / 2 + mr, mr, -Math.PI / 2, 0);
                cr.arc(mw / 2 - mr, mh / 2 - mr, mr, 0, Math.PI / 2);
                cr.arc(-mw / 2 + mr, mh / 2 - mr, mr, Math.PI / 2, Math.PI);
                cr.arc(-mw / 2 + mr, -mh / 2 + mr, mr, Math.PI, 3 * Math.PI / 2);
                cr.closePath();
                cr.stroke();
                // Wheel
                cr.moveTo(0, -7);
                cr.lineTo(0, -2);
                cr.stroke();
                break;
            }
            case 'keyboard': {
                // Keyboard
                cr.setLineWidth(1.8);
                cr.rectangle(-12, -7, 24, 14);
                cr.stroke();
                // Key lines
                cr.moveTo(-8, -2);
                cr.lineTo(8, -2);
                cr.moveTo(-8, 2);
                cr.lineTo(8, 2);
                cr.stroke();
                break;
            }
            case 'laptop':
            default: {
                // Laptop
                cr.setLineWidth(1.8);
                const lw = 20, lh = 14, lr = 2.5;
                cr.arc(lw / 2 - lr, -lh / 2 + lr - 2, lr, -Math.PI / 2, 0);
                cr.arc(lw / 2 - lr, lh / 2 - lr - 2, lr, 0, Math.PI / 2);
                cr.arc(-lw / 2 + lr, lh / 2 - lr - 2, lr, Math.PI / 2, Math.PI);
                cr.arc(-lw / 2 + lr, -lh / 2 + lr - 2, lr, Math.PI, 3 * Math.PI / 2);
                cr.closePath();
                cr.stroke();
                // Base
                cr.moveTo(-13, 8);
                cr.lineTo(13, 8);
                cr.stroke();
                break;
            }
        }

        cr.restore();
    }

    _updateBatteryInfo() {
        const list = [];

        try {
            const bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);

            // 1. Primary Laptop / Computer Battery
            try {
                const res = bus.call_sync(
                    'org.freedesktop.UPower',
                    '/org/freedesktop/UPower/devices/DisplayDevice',
                    'org.freedesktop.DBus.Properties',
                    'GetAll',
                    new GLib.Variant('(s)', ['org.freedesktop.UPower.Device']),
                    null,
                    Gio.DBusCallFlags.NONE,
                    1000,
                    null
                );
                const d = res.get_child_value(0);
                const isPresent = d.lookup_value('IsPresent', null)?.get_boolean() ?? true;
                const pct = Math.round(d.lookup_value('Percentage', null)?.get_double() ?? 100);
                const state = d.lookup_value('State', null)?.get_uint32() ?? 2;
                if (isPresent && pct > 0) {
                    list.push({
                        name: 'Laptop',
                        type: 'laptop',
                        percent: pct,
                        charging: (state === 1),
                    });
                }
            } catch (_) {}

            // 2. UPower Accessory Devices (Mice, Keyboards, Bluetooth headsets)
            try {
                const enumRes = bus.call_sync(
                    'org.freedesktop.UPower',
                    '/org/freedesktop/UPower',
                    'org.freedesktop.UPower',
                    'EnumerateDevices',
                    null,
                    null,
                    Gio.DBusCallFlags.NONE,
                    1000,
                    null
                );
                const paths = enumRes.get_child_value(0).get_objv();
                for (const p of paths) {
                    if (p.includes('battery_BAT') || p.includes('line_power') || p.includes('DisplayDevice'))
                        continue;
                    const pRes = bus.call_sync(
                        'org.freedesktop.UPower',
                        p,
                        'org.freedesktop.DBus.Properties',
                        'GetAll',
                        new GLib.Variant('(s)', ['org.freedesktop.UPower.Device']),
                        null,
                        Gio.DBusCallFlags.NONE,
                        1000,
                        null
                    );
                    const d = pRes.get_child_value(0);
                    const pct = Math.round(d.lookup_value('Percentage', null)?.get_double() ?? 0);
                    const state = d.lookup_value('State', null)?.get_uint32() ?? 2;
                    const model = d.lookup_value('Model', null)?.get_string()[0] || 'Accessory';
                    const devType = d.lookup_value('Type', null)?.get_uint32() ?? 0;

                    if (pct > 0) {
                        let t = 'headphones';
                        if (devType === 5) t = 'mouse';
                        else if (devType === 6) t = 'keyboard';
                        else if (devType === 8) t = 'phone';

                        list.push({
                            name: model,
                            type: t,
                            percent: pct,
                            charging: (state === 1),
                        });
                    }
                }
            } catch (_) {}

            // 3. BlueZ Connected Bluetooth Devices (Phones, Smartwatches, Headphones, Mice)
            try {
                const bzRes = bus.call_sync(
                    'org.bluez',
                    '/',
                    'org.freedesktop.DBus.ObjectManager',
                    'GetManagedObjects',
                    null,
                    null,
                    Gio.DBusCallFlags.NONE,
                    1000,
                    null
                );
                const dict = bzRes.get_child_value(0);
                for (let i = 0; i < dict.n_children(); i++) {
                    const entry = dict.get_child_value(i);
                    const ifaces = entry.get_child_value(1);
                    let isConnected = false;
                    let devName = '';
                    let batteryPct = null;

                    for (let j = 0; j < ifaces.n_children(); j++) {
                        const ifaceEntry = ifaces.get_child_value(j);
                        const ifaceName = ifaceEntry.get_child_value(0).get_string()[0];
                        const props = ifaceEntry.get_child_value(1);

                        if (ifaceName === 'org.bluez.Device1') {
                            isConnected = props.lookup_value('Connected', null)?.get_boolean() ?? false;
                            devName = props.lookup_value('Name', null)?.get_string()[0] || 'Device';
                        } else if (ifaceName === 'org.bluez.Battery1') {
                            batteryPct = props.lookup_value('Percentage', null)?.get_byte() ?? null;
                        }
                    }

                    if (isConnected && batteryPct !== null) {
                        const lower = devName.toLowerCase();
                        let type = 'headphones';
                        if (lower.includes('phone') || lower.includes('iphone') || lower.includes('galaxy') || lower.includes('pixel')) {
                            type = 'phone';
                        } else if (lower.includes('watch') || lower.includes('band') || lower.includes('wear')) {
                            type = 'watch';
                        } else if (lower.includes('mouse')) {
                            type = 'mouse';
                        } else if (lower.includes('keyboard')) {
                            type = 'keyboard';
                        }

                        // Avoid duplicate entries
                        if (!list.some(d => d.name === devName)) {
                            list.push({
                                name: devName,
                                type: type,
                                percent: batteryPct,
                                charging: false,
                            });
                        }
                    }
                }
            } catch (_) {}
        } catch (_) {}

        // Fallback: If no device detected at all, show 100% laptop
        if (list.length === 0) {
            list.push({
                name: 'Laptop',
                type: 'laptop',
                percent: 100,
                charging: true,
            });
        }

        this._devices = list;

        // Render slots (up to 4)
        for (let i = 0; i < 4; i++) {
            const dev = this._devices[i];
            const canvas = this._slotCanvases[i];
            const label = this._slotLabels[i];

            if (dev && dev.percent !== undefined) {
                label.set_text(`${dev.percent} %`);
            } else {
                label.set_text(' ');
            }

            if (canvas) {
                canvas.queue_repaint();
            }
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
