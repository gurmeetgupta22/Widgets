import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import { BaseWidget } from './BaseWidget.js';

const _uid = Date.now().toString(36);

export const ClockWidget = GObject.registerClass(
{
    GTypeName: `WidgetsClockWidget_${_uid}`,
},
class ClockWidget extends BaseWidget {
    _init(settings) {
        super._init('clock', 'Clock', 'preferences-system-time-symbolic', 'small', settings);

        this._timerId = 0;
        this._mode = this._settings?.get_string('clock-style') || 'analog-dark';
        if (this._mode === 'analog') {
            this._mode = 'analog-dark';
        }

        this._buildUI();
        this._applyMode();
        this._onSizeChanged(this.width, this.height);
        this._updateTime();
        this._startTimer();

        // Listen for preferences changes
        if (this._settings) {
            this._settings.connect('changed::clock-style', () => {
                let s = this._settings.get_string('clock-style');
                if (s === 'analog') s = 'analog-dark';
                if (s !== this._mode) {
                    this._mode = s;
                    this._applyMode();
                    this._updateTime();
                }
            });
            this._settings.connect('changed::clock-show-seconds', () => {
                this._updateTime();
            });
        }
    }

    _buildUI() {
        // --- Digital Clock Box ---
        this.digitalContainer = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });

        this.dayLabel = new St.Label({
            text: 'TODAY',
            style_class: 'clock-day',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.digitalContainer.add_child(this.dayLabel);

        this.timeBox = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.timeLabel = new St.Label({
            text: '12:00',
            style_class: 'clock-time-large',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.timeBox.add_child(this.timeLabel);

        this.secondsLabel = new St.Label({
            text: ':00',
            style_class: 'clock-seconds',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.timeBox.add_child(this.secondsLabel);

        this.ampmLabel = new St.Label({
            text: 'AM',
            style_class: 'clock-ampm',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.timeBox.add_child(this.ampmLabel);
        this.digitalContainer.add_child(this.timeBox);

        this.dateLabel = new St.Label({
            text: '',
            style_class: 'clock-date',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.digitalContainer.add_child(this.dateLabel);

        // --- Analog Clock Canvas (Full-bleed circular face) ---
        this.analogCanvas = new St.DrawingArea({
            style_class: 'clock-analog-canvas-full',
            width: 156,
            height: 156,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this.analogCanvas.connect('repaint', (area) => this._drawAnalogClock(area));

        this.bodyBox.add_child(this.digitalContainer);
        this.bodyBox.add_child(this.analogCanvas);
    }

    _applyMode() {
        const isDigital = (this._mode === 'digital');
        this.digitalContainer.visible = isDigital;
        this.analogCanvas.visible = !isDigital;

        if (isDigital) {
            this.remove_style_class_name('widget-clock-analog');
            this.headerBox.visible = true;
            this.headerTitle.visible = true;
            if (this.headerIcon) this.headerIcon.visible = true;
        } else {
            // Analog mode: full fit, no text
            this.add_style_class_name('widget-clock-analog');
            this.headerTitle.visible = false;
            if (this.headerIcon) this.headerIcon.visible = false;
            this.headerBox.visible = this._editMode;
            this.analogCanvas.queue_repaint();
        }
    }

    setEditMode(enabled) {
        super.setEditMode(enabled);
        if (this._mode !== 'digital') {
            this.headerBox.visible = enabled;
            this.closeButton.visible = enabled;
        }
    }

    _onSizeChanged(w, h) {
        if (!this.analogCanvas)
            return;
        const pad = this._mode === 'digital' ? 24 : 12;
        const s = Math.max(80, Math.min(w, h) - pad);
        this.analogCanvas.set_size(s, s);
        this.analogCanvas.queue_repaint();
    }

    _drawAnalogClock(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        if (w <= 0 || h <= 0) {
            cr.$dispose();
            return;
        }

        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) - 2;
        const isLight = (this._mode === 'analog-light');

        cr.save();

        // 1. Clock Face Background
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        if (isLight) {
            cr.setSourceRGB(1.0, 1.0, 1.0); // Pure Crisp White
        } else {
            cr.setSourceRGB(0.19, 0.19, 0.21); // Modern Dark Charcoal #303035
        }
        cr.fillPreserve();

        // Subtle outer border
        if (isLight) {
            cr.setSourceRGBA(0, 0, 0, 0.10);
        } else {
            cr.setSourceRGBA(1, 1, 1, 0.08);
        }
        cr.setLineWidth(1.0);
        cr.stroke();

        // 2. Numbers 1 to 12 (Large, bold, highly legible)
        const numRadius = r * 0.77;
        for (let i = 1; i <= 12; i++) {
            const angle = (i * 30 - 90) * Math.PI / 180;
            const nx = cx + numRadius * Math.cos(angle);
            const ny = cy + numRadius * Math.sin(angle);

            const layout = PangoCairo.create_layout(cr);
            layout.set_text(i.toString(), -1);
            const fontDesc = Pango.FontDescription.from_string('Sans Bold 11.5');
            layout.set_font_description(fontDesc);

            const [tw, th] = layout.get_pixel_size();
            cr.moveTo(nx - tw / 2, ny - th / 2);

            if (isLight) {
                cr.setSourceRGB(0.05, 0.05, 0.05); // Deep Black
            } else {
                cr.setSourceRGB(0.98, 0.98, 0.98); // Crisp White
            }
            PangoCairo.show_layout(cr, layout);
        }

        // 3. Time Calculations
        const now = GLib.DateTime.new_now_local();
        const hours = now ? now.get_hour() : 0;
        const minutes = now ? now.get_minute() : 0;
        const seconds = now ? now.get_second() : 0;

        const hourAngle = ((hours % 12) + minutes / 60 + seconds / 3600) * 30 - 90;
        const minAngle = (minutes + seconds / 60) * 6 - 90;
        const secAngle = seconds * 6 - 90;

        cr.setLineCap(cairo.LineCap.ROUND);

        // 4. Hour Hand (Thick rounded pill hand)
        const hourLen = r * 0.50;
        const hourRad = hourAngle * Math.PI / 180;
        cr.moveTo(cx, cy);
        cr.lineTo(cx + hourLen * Math.cos(hourRad), cy + hourLen * Math.sin(hourRad));
        cr.setLineWidth(5.2);
        if (isLight) {
            cr.setSourceRGB(0.05, 0.05, 0.05);
        } else {
            cr.setSourceRGB(0.98, 0.98, 0.98);
        }
        cr.stroke();

        // 5. Minute Hand (Slightly narrower, longer rounded hand)
        const minLen = r * 0.76;
        const minRad = minAngle * Math.PI / 180;
        cr.moveTo(cx, cy);
        cr.lineTo(cx + minLen * Math.cos(minRad), cy + minLen * Math.sin(minRad));
        cr.setLineWidth(3.6);
        if (isLight) {
            cr.setSourceRGB(0.08, 0.08, 0.08);
        } else {
            cr.setSourceRGB(0.98, 0.98, 0.98);
        }
        cr.stroke();

        // 6. Second Hand (Vibrant Apple Orange with counterweight tail)
        const secLen = r * 0.84;
        const secTail = r * 0.18;
        const secRad = secAngle * Math.PI / 180;
        const secRadOpp = secRad + Math.PI;

        cr.moveTo(cx + secTail * Math.cos(secRadOpp), cy + secTail * Math.sin(secRadOpp));
        cr.lineTo(cx + secLen * Math.cos(secRad), cy + secLen * Math.sin(secRad));
        cr.setLineWidth(1.6);
        cr.setSourceRGB(1.0, 0.584, 0.0); // #ff9500
        cr.stroke();

        // 7. Center Pivot Hub
        cr.arc(cx, cy, 4.0, 0, 2 * Math.PI);
        cr.setSourceRGB(1.0, 0.584, 0.0);
        cr.fill();

        // Inner center pin dot
        cr.arc(cx, cy, 1.4, 0, 2 * Math.PI);
        if (isLight) {
            cr.setSourceRGB(0.1, 0.1, 0.1);
        } else {
            cr.setSourceRGB(1.0, 1.0, 1.0);
        }
        cr.fill();

        cr.restore();
        cr.$dispose();
    }

    _updateTime() {
        const now = GLib.DateTime.new_now_local();
        if (!now)
            return;

        if (this._mode === 'digital') {
            const dayName = now.format('%A')?.toUpperCase() || '';
            const dateStr = now.format('%d %B') || '';
            const timeStr = now.format('%I:%M') || '';
            const secStr = now.format(':%S') || '';
            const ampmStr = now.format('%p') || '';

            this.dayLabel.set_text(dayName);
            this.timeLabel.set_text(timeStr);
            this.secondsLabel.set_text(secStr);
            this.ampmLabel.set_text(ampmStr);
            this.dateLabel.set_text(dateStr);

            const showSeconds = this._settings ? this._settings.get_boolean('clock-show-seconds') : true;
            this.secondsLabel.visible = showSeconds;
        } else {
            if (this.analogCanvas && this.analogCanvas.visible) {
                this.analogCanvas.queue_repaint();
            }
        }
    }

    _startTimer() {
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateTime();
            return GLib.SOURCE_CONTINUE;
        });
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        super.destroy();
    }
});
