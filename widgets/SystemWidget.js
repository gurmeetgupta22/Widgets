import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { BaseWidget } from './BaseWidget.js';

const _uid = Date.now().toString(36);

export const SystemWidget = GObject.registerClass(
{
    GTypeName: `WidgetsSystemWidget_${_uid}`,
},
class SystemWidget extends BaseWidget {
    _init(settings) {
        super._init('system', 'Activity & Resources', 'utilities-system-monitor-symbolic', 'medium', settings);

        this._prevCpuTotal = 0;
        this._prevCpuIdle = 0;
        this._timerId = 0;

        this._buildUI();
        this._updateStats();

        // Update stats every 2.5 seconds
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._updateStats();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _buildUI() {
        const gridBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
        });

        // CPU box
        this.cpuBox = this._createStatBox('CPU', '0%', '#0a84ff');
        gridBox.add_child(this.cpuBox.container);

        // Memory box
        this.memBox = this._createStatBox('RAM', '0%', '#30d158');
        gridBox.add_child(this.memBox.container);

        // Disk box
        this.diskBox = this._createStatBox('DISK', '0%', '#ff9f0a');
        gridBox.add_child(this.diskBox.container);

        this.bodyBox.add_child(gridBox);
    }

    _createStatBox(title, initialVal, color) {
        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'system-stat-box',
            x_expand: true,
            y_expand: true,
        });

        const titleLabel = new St.Label({
            text: title,
            style_class: 'system-stat-title',
        });
        container.add_child(titleLabel);

        const valLabel = new St.Label({
            text: initialVal,
            style_class: 'system-stat-val',
            margin_top: 2,
        });
        container.add_child(valLabel);

        const meterBg = new St.Widget({
            style_class: 'system-meter-bg',
            x_expand: true,
            height: 6,
        });

        const meterFill = new St.Widget({
            style_class: 'system-meter-fill',
            style: `background-color: ${color};`,
            width: 10,
            height: 6,
        });
        meterBg.add_child(meterFill);
        container.add_child(meterBg);

        return {
            container,
            valLabel,
            meterBg,
            meterFill,
            color,
        };
    }

    _updateStats() {
        // 1. CPU Usage via /proc/stat
        try {
            const [ok, content] = GLib.file_get_contents('/proc/stat');
            if (ok) {
                const text = new TextDecoder().decode(content);
                const firstLine = text.split('\n')[0];
                const parts = firstLine.split(/\s+/).slice(1).map(Number);
                const idle = parts[3] + (parts[4] || 0);
                const total = parts.reduce((acc, n) => acc + n, 0);

                if (this._prevCpuTotal > 0) {
                    const diffTotal = total - this._prevCpuTotal;
                    const diffIdle = idle - this._prevCpuIdle;
                    const cpuPercent = Math.max(0, Math.min(100, Math.round(((diffTotal - diffIdle) / diffTotal) * 100)));

                    this.cpuBox.valLabel.set_text(`${cpuPercent}%`);
                    const fillW = Math.max(4, Math.round((cpuPercent / 100) * 80));
                    this.cpuBox.meterFill.set_width(fillW);
                }

                this._prevCpuTotal = total;
                this._prevCpuIdle = idle;
            }
        } catch (e) {}

        // 2. RAM Memory Usage via /proc/meminfo
        try {
            const [ok, content] = GLib.file_get_contents('/proc/meminfo');
            if (ok) {
                const text = new TextDecoder().decode(content);
                let memTotal = 0;
                let memAvail = 0;
                for (const line of text.split('\n')) {
                    if (line.startsWith('MemTotal:'))
                        memTotal = parseInt(line.replace(/[^0-9]/g, ''), 10);
                    else if (line.startsWith('MemAvailable:'))
                        memAvail = parseInt(line.replace(/[^0-9]/g, ''), 10);
                }

                if (memTotal > 0) {
                    const memUsed = memTotal - memAvail;
                    const memPercent = Math.round((memUsed / memTotal) * 100);
                    const memUsedGB = (memUsed / (1024 * 1024)).toFixed(1);

                    this.memBox.valLabel.set_text(`${memPercent}%`);
                    const fillW = Math.max(4, Math.round((memPercent / 100) * 80));
                    this.memBox.meterFill.set_width(fillW);
                }
            }
        } catch (e) {}

        // 3. Disk Usage
        try {
            const file = Gio.File.new_for_path('/');
            const info = file.query_filesystem_info('filesystem::size,filesystem::free', null);
            if (info) {
                const total = info.get_attribute_uint64('filesystem::size');
                const free = info.get_attribute_uint64('filesystem::free');
                if (total > 0) {
                    const used = total - free;
                    const diskPercent = Math.round((used / total) * 100);
                    this.diskBox.valLabel.set_text(`${diskPercent}%`);
                    const fillW = Math.max(4, Math.round((diskPercent / 100) * 80));
                    this.diskBox.meterFill.set_width(fillW);
                }
            }
        } catch (e) {}
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        super.destroy();
    }
});
