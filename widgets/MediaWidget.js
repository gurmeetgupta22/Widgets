import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { BaseWidget } from './BaseWidget.js';

const _uid = Date.now().toString(36);

export const MediaWidget = GObject.registerClass(
{
    GTypeName: `WidgetsMediaWidget_${_uid}`,
},
class MediaWidget extends BaseWidget {
    _init(settings) {
        super._init('media', 'Now Playing', 'audio-x-generic-symbolic', 'medium', settings);

        this._timerId = 0;
        this._currentOwner = null;
        this._isPlaying = false;
        this._trackLength = 0;
        this._trackPosition = 0;
        this._lastArtUrl = null;

        // CRITICAL: Always interactive so player controls respond to mouse clicks outside edit mode
        this.reactive = true;
        this.track_hover = true;
        this.can_focus = false;

        this._buildUI();

        // Start polling only once the widget is on the stage
        this.connect('notify::mapped', () => {
            if (this.mapped && !this._timerId) {
                this._updateMedia();
                this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                    this._updateMedia();
                    return GLib.SOURCE_CONTINUE;
                });
            }
        });
    }

    _buildUI() {
        // Hide standard widget title header; closeButton will be placed inside media-card
        this.headerBox.visible = false;

        // Container card
        const mediaContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style_class: 'media-container-card',
        });

        // ── Top Row: Art + Info/Controls ─────────────────────────────────────
        const topRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
        });

        // Left: Album Art Box
        this.artBox = new St.Widget({
            style_class: 'media-art-box',
            width: 104,
            height: 104,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });

        this.artIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 52,
            style_class: 'media-art-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this.artBox.add_child(this.artIcon);
        topRow.add_child(this.artBox);

        // Right: Title, Artist, and Playback Controls
        const rightCol = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style_class: 'media-info-col',
        });

        // Top info header with subtle audio badge
        const metaRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
        });

        const textCol = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });

        this.titleLabel = new St.Label({
            text: 'Not Playing',
            style_class: 'media-title',
            x_align: Clutter.ActorAlign.START,
        });
        this.titleLabel.clutter_text.set_ellipsize(3);
        textCol.add_child(this.titleLabel);

        this.artistLabel = new St.Label({
            text: 'Open a media player',
            style_class: 'media-artist',
            x_align: Clutter.ActorAlign.START,
        });
        this.artistLabel.clutter_text.set_ellipsize(3);
        textCol.add_child(this.artistLabel);

        metaRow.add_child(textCol);

        // Subtle music badge icon on top right
        this.badgeIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 15,
            style_class: 'media-badge-icon',
            y_align: Clutter.ActorAlign.START,
            x_align: Clutter.ActorAlign.END,
        });
        metaRow.add_child(this.badgeIcon);
        rightCol.add_child(metaRow);

        // Controls row: [ Prev ]   (  Play/Pause  )   [ Next ]
        const ctrlRow = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            style_class: 'media-controls-row',
        });

        // Previous Button
        this.prevBtn = new St.Button({
            child: new St.Icon({
                icon_name: 'media-skip-backward-symbolic',
                icon_size: 17,
            }),
            style_class: 'media-ctrl-btn media-ctrl-skip',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this.prevBtn.connect('clicked', () => this._mpris('Previous'));
        ctrlRow.add_child(this.prevBtn);

        // Play/Pause Button - centered circle
        this.playBtn = new St.Button({
            child: new St.Icon({
                icon_name: 'media-playback-start-symbolic',
                icon_size: 20,
            }),
            style_class: 'media-ctrl-btn media-ctrl-play',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this.playBtn.connect('clicked', () => this._mpris('PlayPause'));
        ctrlRow.add_child(this.playBtn);

        // Next Button
        this.nextBtn = new St.Button({
            child: new St.Icon({
                icon_name: 'media-skip-forward-symbolic',
                icon_size: 17,
            }),
            style_class: 'media-ctrl-btn media-ctrl-skip',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this.nextBtn.connect('clicked', () => this._mpris('Next'));
        ctrlRow.add_child(this.nextBtn);

        rightCol.add_child(ctrlRow);
        topRow.add_child(rightCol);
        mediaContainer.add_child(topRow);

        // ── Bottom Progress Row ──────────────────────────────────────────────
        const bottomBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'media-bottom-box',
        });

        // Time labels above bar
        const timeRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'media-time-row',
        });

        this.posLabel = new St.Label({
            text: '0:00',
            style_class: 'media-time-label',
            x_align: Clutter.ActorAlign.START,
        });
        timeRow.add_child(this.posLabel);

        const spacer = new St.Widget({ x_expand: true });
        timeRow.add_child(spacer);

        this.durLabel = new St.Label({
            text: '0:00',
            style_class: 'media-time-label',
            x_align: Clutter.ActorAlign.END,
        });
        timeRow.add_child(this.durLabel);
        bottomBox.add_child(timeRow);

        // Sleek progress bar
        this.progressBarBg = new St.Widget({
            style_class: 'media-progress-bg',
            x_expand: true,
            height: 4,
        });

        this.progressBarFill = new St.Widget({
            style_class: 'media-progress-fill',
            height: 4,
            width: 0,
        });
        this.progressBarBg.add_child(this.progressBarFill);
        bottomBox.add_child(this.progressBarBg);

        mediaContainer.add_child(bottomBox);
        this.bodyBox.add_child(mediaContainer);
    }

    _fmt(us) {
        if (!us || us <= 0) return '0:00';
        const totalSec = Math.floor(us / 1000000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    _mpris(cmd) {
        if (!this._currentOwner) return;
        try {
            const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
            bus.call_sync(
                this._currentOwner,
                '/org/mpris/MediaPlayer2',
                'org.mpris.MediaPlayer2.Player',
                cmd,
                null,
                null,
                Gio.DBusCallFlags.NONE,
                800,
                null
            );
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                this._updateMedia();
                return GLib.SOURCE_REMOVE;
            });
        } catch (_) {}
    }

    _getProp(bus, owner, iface, prop) {
        try {
            const res = bus.call_sync(
                owner,
                '/org/mpris/MediaPlayer2',
                'org.freedesktop.DBus.Properties',
                'Get',
                new GLib.Variant('(ss)', [iface, prop]),
                null,
                Gio.DBusCallFlags.NONE,
                800,
                null
            );
            if (!res) return null;
            const child = res.get_child_value(0);
            if (!child) return null;
            return child.is_of_type(new GLib.VariantType('v')) ? child.get_variant() : child;
        } catch (_) {
            return null;
        }
    }

    _extractString(val) {
        if (!val) return null;
        try {
            const v = val.is_of_type(new GLib.VariantType('v')) ? val.get_variant() : val;
            if (v.is_of_type(new GLib.VariantType('s'))) {
                return v.get_string()[0];
            }
        } catch (_) {}
        return null;
    }

    _extractStrv(val) {
        if (!val) return null;
        try {
            const v = val.is_of_type(new GLib.VariantType('v')) ? val.get_variant() : val;
            if (v.is_of_type(new GLib.VariantType('as'))) {
                return v.get_strv().join(', ');
            }
            if (v.is_of_type(new GLib.VariantType('s'))) {
                return v.get_string()[0];
            }
        } catch (_) {}
        return null;
    }

    _extractInt64(val) {
        if (!val) return 0;
        try {
            const v = val.is_of_type(new GLib.VariantType('v')) ? val.get_variant() : val;
            const t = v.get_type_string();
            if (t === 'x') return v.get_int64();
            if (t === 't') return v.get_uint64();
            if (t === 'i') return v.get_int32();
            if (t === 'u') return v.get_uint32();
            if (t === 'd') return Math.round(v.get_double());
        } catch (_) {}
        return 0;
    }

    _updateMedia() {
        try {
            const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
            const res = bus.call_sync(
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus',
                'ListNames',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                800,
                null
            );
            const names = res.get_child_value(0).get_strv();
            const mpris = names.filter(n => n.startsWith('org.mpris.MediaPlayer2.'));
            if (!mpris || mpris.length === 0) {
                this._setIdle();
                return;
            }

            // Find actively playing player, or default to the first one (e.g. Spotify)
            let chosen = mpris[0];
            for (const name of mpris) {
                const st = this._getProp(bus, name, 'org.mpris.MediaPlayer2.Player', 'PlaybackStatus');
                const stStr = this._extractString(st);
                if (stStr === 'Playing') {
                    chosen = name;
                    break;
                }
            }
            this._currentOwner = chosen;

            // PlaybackStatus
            const statusVal = this._getProp(bus, chosen, 'org.mpris.MediaPlayer2.Player', 'PlaybackStatus');
            const statusStr = this._extractString(statusVal);
            const isPlaying = (statusStr === 'Playing');
            this._isPlaying = isPlaying;

            // Update play icon
            this.playBtn.child = new St.Icon({
                icon_name: isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
                icon_size: 20,
            });

            if (isPlaying) {
                this.add_style_class_name('media-playing');
            } else {
                this.remove_style_class_name('media-playing');
            }
            this._applyLiquidGlass();

            // Metadata
            let title = 'Unknown Track';
            let artist = 'Unknown Artist';
            let artUrl = null;
            this._trackLength = 0;

            const meta = this._getProp(bus, chosen, 'org.mpris.MediaPlayer2.Player', 'Metadata');
            if (meta) {
                const titleVar = meta.lookup_value('xesam:title', null);
                if (titleVar) {
                    title = this._extractString(titleVar) || title;
                }

                const artistVar = meta.lookup_value('xesam:artist', null);
                if (artistVar) {
                    artist = this._extractStrv(artistVar) || artist;
                }

                const lenVar = meta.lookup_value('mpris:length', null);
                if (lenVar) {
                    this._trackLength = this._extractInt64(lenVar);
                }

                const artVar = meta.lookup_value('mpris:artUrl', null);
                if (artVar) {
                    artUrl = this._extractString(artVar);
                }
            }

            this.titleLabel.set_text(title);
            this.artistLabel.set_text(artist);
            this.durLabel.set_text(this._fmt(this._trackLength));

            // Position
            const posVal = this._getProp(bus, chosen, 'org.mpris.MediaPlayer2.Player', 'Position');
            this._trackPosition = this._extractInt64(posVal);
            this.posLabel.set_text(this._fmt(this._trackPosition));

            this._updateArt(artUrl);
            this._updateProgressBar();
        } catch (_) {
            this._setIdle();
        }
    }

    _showDefaultArt() {
        this.artIcon.gicon = null;
        this.artIcon.icon_name = 'media-optical-cd-audio-symbolic';
        this.artIcon.icon_size = 48;
        this.artBox.remove_style_class_name('media-has-art');
    }

    _displayImageFile(filePath) {
        try {
            if (GLib.file_test(filePath, GLib.FileTest.EXISTS)) {
                const file = Gio.File.new_for_path(filePath);
                this.artIcon.gicon = Gio.FileIcon.new(file);
                this.artIcon.icon_name = null;
                this.artIcon.icon_size = 104;
                this.artBox.add_style_class_name('media-has-art');
                return true;
            }
        } catch (_) {}
        this._showDefaultArt();
        return false;
    }

    _updateArt(artUrl) {
        if (!artUrl || artUrl === '') {
            this._lastArtUrl = null;
            this._showDefaultArt();
            return;
        }

        if (artUrl === this._lastArtUrl) return;
        this._lastArtUrl = artUrl;

        // 1. Local file (file://)
        if (artUrl.startsWith('file://')) {
            try {
                const path = GLib.filename_from_uri(artUrl)[0];
                if (path && this._displayImageFile(path)) return;
            } catch (_) {}
        }

        // 2. HTTP / HTTPS (Spotify)
        if (artUrl.startsWith('http://') || artUrl.startsWith('https://')) {
            try {
                const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-shell-widgets']);
                const dirFile = Gio.File.new_for_path(cacheDir);
                if (!dirFile.query_exists(null)) {
                    dirFile.make_directory_with_parents(null);
                }

                const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, artUrl, -1);
                const destPath = GLib.build_filenamev([cacheDir, `${hash}.jpg`]);

                if (GLib.file_test(destPath, GLib.FileTest.EXISTS)) {
                    this._displayImageFile(destPath);
                    return;
                }

                // Download using curl asynchronously
                const currentRequestUrl = artUrl;
                const proc = Gio.Subprocess.new(
                    ['curl', '-s', '-L', '-m', '6', '-o', destPath, artUrl],
                    Gio.SubprocessFlags.NONE
                );

                proc.wait_check_async(null, (_proc, res) => {
                    try {
                        proc.wait_check_finish(res);
                        if (this._lastArtUrl === currentRequestUrl && GLib.file_test(destPath, GLib.FileTest.EXISTS)) {
                            this._displayImageFile(destPath);
                        }
                    } catch (_) {
                        this._showDefaultArt();
                    }
                });
                return;
            } catch (_) {}
        }

        this._showDefaultArt();
    }

    _setIdle() {
        this.titleLabel.set_text('Not Playing');
        this.artistLabel.set_text('Open Spotify or media player');
        this.posLabel.set_text('0:00');
        this.durLabel.set_text('0:00');
        this._currentOwner = null;
        this._trackLength = 0;
        this._trackPosition = 0;
        this._isPlaying = false;
        this._lastArtUrl = null;
        this.playBtn.child = new St.Icon({
            icon_name: 'media-playback-start-symbolic',
            icon_size: 20,
        });
        this.remove_style_class_name('media-playing');
        this._applyLiquidGlass();
        if (this.progressBarFill) this.progressBarFill.width = 0;
        this._showDefaultArt();
    }

    _updateProgressBar() {
        if (!this.progressBarBg || !this.progressBarFill) return;
        const totalW = this.progressBarBg.width;
        if (totalW <= 0 || this._trackLength <= 0) {
            this.progressBarFill.width = 0;
            return;
        }
        const ratio = Math.max(0, Math.min(1, this._trackPosition / this._trackLength));
        this.progressBarFill.width = Math.round(totalW * ratio);
    }

    // Interactive widget: always stays reactive so playback buttons work
    setEditMode(enabled) {
        super.setEditMode(enabled);
        this.reactive = true;
        this.track_hover = true;
        this.headerBox.visible = enabled;
        this.closeButton.visible = enabled;
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        super.destroy();
    }
});
