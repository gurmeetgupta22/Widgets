import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import cairo from 'cairo';
import {
    applyBackgroundBlur,
    removeBackgroundBlur,
    glassTintStyle,
} from '../liquidGlass.js';

const _uid = Date.now().toString(36);

export const BaseWidget = GObject.registerClass(
{
    GTypeName: `WidgetsBaseWidget_${_uid}`,
    Signals: {
        'remove-requested': {},
        'position-changed': {
            param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE],
        },
        'size-changed': {
            param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE],
        },
    },
},
class BaseWidget extends St.Widget {
    _init(id, title, iconName, size = 'small', settings = null) {
        super._init({
            reactive: true,
            track_hover: true,
            can_focus: true,
        });

        this.id = id;
        this.title = title;
        this.iconName = iconName;
        this.widgetSize = size;
        this._settings = settings;
        this._editMode = false;
        this._isDragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._initialActorX = 0;
        this._initialActorY = 0;
        this._grab = null;
        this._themeWatchId = 0;
        this._themeGtkWatchId = 0;
        this._ifaceSettings = null;
        this._glassOpacityId = 0;
        this._glassBlurId = 0;
        this._glassAppearanceId = 0;
        this._isResizing = false;
        this._pendingResize = false;
        this._initialWidth = 0;
        this._initialHeight = 0;
        this._minWidth = 140;
        this._minHeight = 110;

        this.add_style_class_name('widget-card');
        this.add_style_class_name('widget-liquid-glass');
        this.add_style_class_name(`widget-${this.widgetSize}`);

        this._buildLayout();
        this._setupDragHandling();
        this._applyStoredSize();
        this._applySystemTheme();
        this._watchTheme();
        this._watchGlassSettings();
    }

    // ── System Theme ──────────────────────────────────────────────────────────
    _getSystemColorScheme() {
        try {
            const s = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            const scheme = s.get_string('color-scheme');
            if (scheme === 'prefer-light') return 'light';
            if (scheme === 'prefer-dark') return 'dark';
            // When 'default', inspect the active GTK theme name
            const gtkTheme = (s.get_string('gtk-theme') || '').toLowerCase();
            if (gtkTheme.includes('light')) return 'light';
            return 'dark'; // default to dark
        } catch (_) {
            return 'dark';
        }
    }

    _applySystemTheme() {
        const mode = (() => {
            try {
                return this._settings?.get_string('glass-appearance') || 'system';
            } catch (_) {
                return 'system';
            }
        })();
        let isDark;
        if (mode === 'light')
            isDark = false;
        else if (mode === 'dark')
            isDark = true;
        else
            isDark = this._getSystemColorScheme() === 'dark';

        if (isDark) {
            this.add_style_class_name('widget-dark-theme');
            this.remove_style_class_name('widget-light-theme');
        } else {
            this.add_style_class_name('widget-light-theme');
            this.remove_style_class_name('widget-dark-theme');
        }
        this._applyLiquidGlass();
        if (typeof this._onThemeChanged === 'function') {
            this._onThemeChanged();
        }
    }

    _watchGlassSettings() {
        if (!this._settings)
            return;
        this._glassOpacityId = this._settings.connect('changed::glass-opacity', () => {
            this._applyLiquidGlass();
        });
        this._glassBlurId = this._settings.connect('changed::glass-blur-sigma', () => {
            this._applyLiquidGlass();
        });
        try {
            this._glassAppearanceId = this._settings.connect('changed::glass-appearance', () => {
                this._applySystemTheme();
            });
        } catch (_) {}
    }

    _isDarkTheme() {
        return !this.has_style_class_name('widget-light-theme');
    }

    _applyLiquidGlass() {
        const isDark = this._isDarkTheme();
        const opacity = this._settings?.get_double('glass-opacity') ?? 0.55;
        let sigma = 20;
        try {
            sigma = this._settings?.get_int('glass-blur-sigma') ?? 20;
        } catch (_) {
            sigma = 20;
        }

        // Blur must live on the clipped inner actor. Applying it to the
        // chrome root paints a darkened halo around the rounded card.
        removeBackgroundBlur(this);
        if (this._glassBlur) {
            applyBackgroundBlur(this._glassBlur, {
                sigma,
                brightness: 1.0,
            });
        }

        const tint = glassTintStyle(isDark, opacity, {
            playing: this.has_style_class_name('media-playing'),
        });
        if (this._glassTint)
            this._glassTint.set_style(tint);
        this.set_style('');
    }

    _watchTheme() {
        try {
            const s = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            this._themeWatchId = s.connect('changed::color-scheme', () => this._applySystemTheme());
            this._themeGtkWatchId = s.connect('changed::gtk-theme', () => this._applySystemTheme());
            this._ifaceSettings = s;
        } catch (_) {}
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    _buildLayout() {
        this.layout_manager = new Clutter.BinLayout();

        this._glassClip = new St.Widget({
            style_class: 'widget-glass-clip',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            reactive: false,
            clip_to_allocation: true,
        });
        this._glassClip.layout_manager = new Clutter.BinLayout();
        try {
            this._glassClip.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
        } catch (_) {}

        this._glassBlur = new St.Widget({
            style_class: 'widget-glass-blur',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            reactive: false,
        });
        this._glassTint = new St.Widget({
            style_class: 'widget-glass-tint',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            reactive: false,
        });
        this._glassClip.add_child(this._glassBlur);
        this._glassClip.add_child(this._glassTint);

        this._contentBox = new St.BoxLayout({
            vertical: true,
            style_class: 'widget-glass-content',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        this.headerBox = new St.BoxLayout({
            style_class: 'widget-header',
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        if (this.iconName) {
            this.headerIcon = new St.Icon({
                icon_name: this.iconName,
                style_class: 'widget-icon-header',
            });
            this.headerBox.add_child(this.headerIcon);
        }

        this.headerTitle = new St.Label({
            text: this.title,
            style_class: 'widget-title',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this.headerBox.add_child(this.headerTitle);

        this.closeButton = new St.Button({
            label: '✕',
            style_class: 'widget-close-btn',
            reactive: false,
            visible: false,
            can_focus: false,
            x_align: Clutter.ActorAlign.END,
        });
        this.closeButton.connect('clicked', () => this.emit('remove-requested'));
        this.headerBox.add_child(this.closeButton);

        this.bodyBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
        });

        this._contentBox.add_child(this.headerBox);
        this._contentBox.add_child(this.bodyBox);

        this.add_child(this._glassClip);
        this.add_child(this._contentBox);

        this._resizeSlot = new St.Widget({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            reactive: false,
            layout_manager: new Clutter.BinLayout(),
        });
        this._resizeHandle = new St.DrawingArea({
            style_class: 'widget-resize-handle',
            reactive: false,
            visible: false,
            width: 22,
            height: 22,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.END,
        });
        this._resizeHandle.connect('repaint', (area) => {
            const cr = area.get_context();
            const [w, h] = area.get_surface_size();
            cr.setSourceRGBA(1, 1, 1, 0.92);
            cr.setLineWidth(2.5);
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.setLineJoin(cairo.LineJoin.ROUND);
            cr.moveTo(4, h - 4);
            cr.lineTo(w - 4, h - 4);
            cr.lineTo(w - 4, 4);
            cr.stroke();
            cr.$dispose();
        });
        this._resizeSlot.add_child(this._resizeHandle);
        this.add_child(this._resizeSlot);
        this.connect('notify::allocation', () => this._positionResizeHandle());
    }

    _positionResizeHandle() {
        if (!this._resizeHandle)
            return;
        const s = 22;
        this._resizeHandle.x_expand = false;
        this._resizeHandle.y_expand = false;
        this._resizeHandle.x_align = Clutter.ActorAlign.END;
        this._resizeHandle.y_align = Clutter.ActorAlign.END;
        this._resizeHandle.set_size(s, s);
        this._resizeHandle.queue_repaint();
    }

    _getDefaultSize() {
        if (this.widgetSize === 'small')
            return [170, 170];
        if (this.widgetSize === 'large')
            return [360, 340];
        if (this.id === 'notes')
            return [360, 220];
        return [360, 170];
    }

    _applyStoredSize() {
        let w = 0;
        let h = 0;
        try {
            const sizes = JSON.parse(this._settings?.get_string('widget-sizes') || '{}');
            if (sizes[this.id]) {
                w = sizes[this.id].w;
                h = sizes[this.id].h;
            }
        } catch (_) {}
        if (!w || !h) {
            [w, h] = this._getDefaultSize();
        }
        this._setWidgetSize(w, h, false);
    }

    _setWidgetSize(w, h, emit = false) {
        w = Math.max(this._minWidth, Math.round(w));
        h = Math.max(this._minHeight, Math.round(h));
        this.remove_style_class_name('widget-small');
        this.remove_style_class_name('widget-medium');
        this.remove_style_class_name('widget-large');
        this.set_size(w, h);
        this._positionResizeHandle();
        if (typeof this._onSizeChanged === 'function')
            this._onSizeChanged(w, h);
        if (emit)
            this.emit('size-changed', w, h);
    }

    // ── Edit Mode ─────────────────────────────────────────────────────────────
    setEditMode(enabled) {
        this._editMode = enabled;
        this.reactive = true;
        this.track_hover = true;
        this.can_focus = true;

        if (enabled) {
            this.add_style_class_name('edit-mode');
            this.closeButton.visible = true;
            this.closeButton.reactive = true;
            this.closeButton.can_focus = true;
            if (this._resizeHandle) {
                this._resizeHandle.visible = true;
                this._resizeHandle.reactive = true;
                this._positionResizeHandle();
            }
        } else {
            this.remove_style_class_name('edit-mode');
            this.closeButton.visible = false;
            this.closeButton.reactive = false;
            this.closeButton.can_focus = false;
            if (this._resizeHandle) {
                this._resizeHandle.visible = false;
                this._resizeHandle.reactive = false;
            }
            this._stopDrag();
        }
    }

    // ── Drag Handling ─────────────────────────────────────────────────────────
    _stopDrag() {
        if (this._grab) {
            try { this._grab.dismiss(); } catch (_) {}
            this._grab = null;
        }
        this._isDragging = false;
        this._isResizing = false;
        this._pendingResize = false;
        this._pendingDrag = false;
    }

    _isOverCloseButton(stageX, stageY) {
        if (!this.closeButton.visible) return false;
        const [bx, by] = this.closeButton.get_transformed_position();
        const bw = this.closeButton.width;
        const bh = this.closeButton.height;
        return stageX >= bx && stageX <= bx + bw && stageY >= by && stageY <= by + bh;
    }

    _isOverResizeHandle(stageX, stageY) {
        if (!this._resizeHandle || !this._resizeHandle.visible)
            return false;
        const [bx, by] = this._resizeHandle.get_transformed_position();
        const bw = Math.max(22, this._resizeHandle.width);
        const bh = Math.max(22, this._resizeHandle.height);
        return stageX >= bx && stageX <= bx + bw &&
               stageY >= by && stageY <= by + bh;
    }

    _setupDragHandling() {
        this._dragMoved = false;

        this.connect('button-press-event', (actor, event) => {
            if (!this._editMode) return Clutter.EVENT_PROPAGATE;
            if (this._settings?.get_boolean('lock-positions')) return Clutter.EVENT_PROPAGATE;
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;

            const [stageX, stageY] = event.get_coords();
            if (this._isOverCloseButton(stageX, stageY)) return Clutter.EVENT_PROPAGATE;

            this._dragStartX = stageX;
            this._dragStartY = stageY;
            this._initialActorX = this.x;
            this._initialActorY = this.y;
            this._initialWidth = this.width;
            this._initialHeight = this.height;
            this._dragMoved = false;

            if (this._isOverResizeHandle(stageX, stageY)) {
                this._pendingResize = true;
                this._pendingDrag = false;
                return Clutter.EVENT_STOP;
            }

            this._pendingDrag = true;
            this._pendingResize = false;
            return Clutter.EVENT_PROPAGATE;
        });

        this.connect('motion-event', (actor, event) => {
            if (!this._pendingDrag && !this._pendingResize && !this._isDragging && !this._isResizing)
                return Clutter.EVENT_PROPAGATE;

            const [stageX, stageY] = event.get_coords();
            const dx = stageX - this._dragStartX;
            const dy = stageY - this._dragStartY;

            if (this._pendingResize || this._isResizing) {
                if (!this._isResizing) {
                    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return Clutter.EVENT_PROPAGATE;
                    this._isResizing = true;
                    this._pendingResize = false;
                    this._grab = global.stage.grab(this);
                }
                this._setWidgetSize(this._initialWidth + dx, this._initialHeight + dy, false);
                return Clutter.EVENT_STOP;
            }

            if (!this._isDragging) {
                if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return Clutter.EVENT_PROPAGATE;
                this._isDragging = true;
                this._dragMoved = true;
                this._pendingDrag = false;
                this._grab = global.stage.grab(this);
            }

            this.set_position(
                Math.max(0, this._initialActorX + dx),
                Math.max(0, this._initialActorY + dy)
            );
            return Clutter.EVENT_STOP;
        });

        this.connect('button-release-event', (actor, event) => {
            const wasResizing = this._isResizing;
            const wasDragging = this._isDragging;
            this._pendingDrag = false;
            this._pendingResize = false;
            if (!wasResizing && !wasDragging) return Clutter.EVENT_PROPAGATE;
            this._stopDrag();
            if (wasResizing)
                this.emit('size-changed', this.width, this.height);
            else
                this.emit('position-changed', this.x, this.y);
            return Clutter.EVENT_STOP;
        });

        this.connect('key-press-event', (actor, event) => {
            if (!this._editMode) return Clutter.EVENT_PROPAGATE;
            const step = (event.get_state() & Clutter.ModifierType.SHIFT_MASK) ? 20 : 4;
            const sym = event.get_key_symbol();
            switch (sym) {
            case Clutter.KEY_Left:  this.x = Math.max(0, this.x - step); break;
            case Clutter.KEY_Right: this.x = this.x + step; break;
            case Clutter.KEY_Up:    this.y = Math.max(0, this.y - step); break;
            case Clutter.KEY_Down:  this.y = this.y + step; break;
            default: return Clutter.EVENT_PROPAGATE;
            }
            this.emit('position-changed', this.x, this.y);
            return Clutter.EVENT_STOP;
        });
    }

    destroy() {
        if (this._ifaceSettings) {
            if (this._themeWatchId) {
                try { this._ifaceSettings.disconnect(this._themeWatchId); } catch (_) {}
            }
            if (this._themeGtkWatchId) {
                try { this._ifaceSettings.disconnect(this._themeGtkWatchId); } catch (_) {}
            }
        }
        if (this._settings) {
            if (this._glassOpacityId) {
                try { this._settings.disconnect(this._glassOpacityId); } catch (_) {}
            }
            if (this._glassBlurId) {
                try { this._settings.disconnect(this._glassBlurId); } catch (_) {}
            }
            if (this._glassAppearanceId) {
                try { this._settings.disconnect(this._glassAppearanceId); } catch (_) {}
            }
        }
        removeBackgroundBlur(this);
        removeBackgroundBlur(this._glassBlur);
        this._stopDrag();
        super.destroy();
    }
});
