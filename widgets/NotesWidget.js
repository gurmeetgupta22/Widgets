import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import { BaseWidget } from './BaseWidget.js';

const NOTES_FILE_PATH = GLib.build_filenamev([GLib.get_home_dir(), 'Documents', 'quicknotes.txt']);

function readNotesFile() {
    try {
        const file = Gio.File.new_for_path(NOTES_FILE_PATH);
        if (!file.query_exists(null)) return null;
        const [ok, bytes] = file.load_contents(null);
        if (ok) return new TextDecoder().decode(bytes);
    } catch (_) {}
    return null;
}

function writeNotesFile(text) {
    try {
        const docDir = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), 'Documents']));
        if (!docDir.query_exists(null)) {
            docDir.make_directory_with_parents(null);
        }
        const file = Gio.File.new_for_path(NOTES_FILE_PATH);
        const bytes = new TextEncoder().encode(text);
        file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    } catch (e) {
        logError(e, 'NotesWidget: write error');
    }
}

const _uid = Date.now().toString(36);

export const NotesWidget = GObject.registerClass(
{
    GTypeName: `WidgetsNotesWidget_${_uid}`,
},
class NotesWidget extends BaseWidget {
    _init(settings) {
        super._init('notes', 'Quick Note', 'accessories-text-editor-symbolic', 'medium', settings);
        this.add_style_class_name('widget-notes');

        this._saveTimer = 0;
        this._isDirty = false;

        // CRITICAL: Always interactive so clicking and typing works directly on desktop
        this.reactive = true;
        this.track_hover = true;
        this.can_focus = true;

        this._buildUI();
    }

    _buildUI() {
        this.statusLabel = new St.Label({
            text: 'Saved',
            style_class: 'notes-status-badge',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.headerBox.remove_child(this.closeButton);
        this.headerBox.add_child(this.statusLabel);
        this.headerBox.add_child(this.closeButton);

        const paper = new St.BoxLayout({
            vertical: true,
            style_class: 'notes-paper-card',
            x_expand: true,
            y_expand: true,
        });

        const initialText = readNotesFile() ?? this._settings?.get_string('notes-content') ?? '';

        this._entry = new St.Entry({
            text: initialText,
            style_class: 'notes-textarea',
            can_focus: true,
            reactive: true,
            x_expand: true,
            y_expand: true,
        });
        this._entry.set_hint_text('Type note here...');

        const ct = this._entry.clutter_text;
        ct.set_single_line_mode(false);
        ct.set_activatable(false);
        ct.set_line_wrap(true);
        ct.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);

        ct.connect('text-changed', () => {
            this._isDirty = true;
            this.statusLabel.set_text('Typing...');
            this._scheduleSave();
        });

        const scroll = new St.ScrollView({
            x_expand: true,
            y_expand: true,
            style_class: 'notes-scrollview',
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

        const entryBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
        });
        entryBox.add_child(this._entry);
        scroll.add_child(entryBox);
        paper.add_child(scroll);

        const footer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'notes-footer-bar',
        });
        const pathLabel = new St.Label({
            text: '~/Documents/quicknotes.txt',
            style_class: 'notes-path-label',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        footer.add_child(pathLabel);
        paper.add_child(footer);

        this.bodyBox.add_child(paper);

        this.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === 1) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    try { this._entry.grab_key_focus(); } catch (_) {}
                    return GLib.SOURCE_REMOVE;
                });
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._entry.connect('key-focus-out', () => {
            this._flush();
        });
    }

    _scheduleSave() {
        if (this._saveTimer) {
            GLib.source_remove(this._saveTimer);
            this._saveTimer = 0;
        }
        this._saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._flush();
            this._saveTimer = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _flush() {
        if (!this._isDirty || !this._entry) return;
        const text = this._entry.get_text();
        writeNotesFile(text);
        if (this._settings) {
            this._settings.set_string('notes-content', text);
        }
        this._isDirty = false;
        if (this.statusLabel) {
            this.statusLabel.set_text('Saved ✓');
        }
    }

    // Always reactive so user can click and write at any time
    setEditMode(enabled) {
        super.setEditMode(enabled);
        this.reactive = true;
        this.track_hover = true;
        this.can_focus = true;
    }

    destroy() {
        if (this._saveTimer) {
            GLib.source_remove(this._saveTimer);
            this._saveTimer = 0;
        }
        this._flush();
        super.destroy();
    }
});
