import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WidgetsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // 1. General Page
        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        const generalGroup = new Adw.PreferencesGroup({
            title: 'Layout & Behavior',
            description: 'Configure desktop widgets placement and interaction',
        });

        // Lock Positions Switch
        const lockRow = new Adw.SwitchRow({
            title: 'Lock Widget Positions',
            subtitle: 'Prevent widgets from being moved accidentally by dragging',
        });
        settings.bind('lock-positions', lockRow, 'active', 0);
        generalGroup.add(lockRow);

        // Clock Style Row (Digital, Analog Light, Analog Dark)
        const clockStyleModel = new Gtk.StringList();
        clockStyleModel.append('Digital');
        clockStyleModel.append('Analog (Light Mode)');
        clockStyleModel.append('Analog (Dark Mode)');

        const clockStyleRow = new Adw.ComboRow({
            title: 'Clock Style',
            subtitle: 'Choose between Digital, Analog Light, and Analog Dark',
            model: clockStyleModel,
        });

        const currentStyle = settings.get_string('clock-style');
        if (currentStyle === 'analog-light') clockStyleRow.selected = 1;
        else if (currentStyle === 'analog-dark' || currentStyle === 'analog') clockStyleRow.selected = 2;
        else clockStyleRow.selected = 0;

        clockStyleRow.connect('notify::selected', () => {
            const idx = clockStyleRow.selected;
            if (idx === 1) settings.set_string('clock-style', 'analog-light');
            else if (idx === 2) settings.set_string('clock-style', 'analog-dark');
            else settings.set_string('clock-style', 'digital');
        });
        generalGroup.add(clockStyleRow);

        // Show Seconds in Clock
        const secondsRow = new Adw.SwitchRow({
            title: 'Show Clock Seconds',
            subtitle: 'Display ticking seconds in the digital clock widget',
        });
        settings.bind('clock-show-seconds', secondsRow, 'active', 0);
        generalGroup.add(secondsRow);

        const glassGroup = new Adw.PreferencesGroup({
            title: 'Liquid Glass',
            description: 'Frosted glass look: blur the wallpaper behind widgets, then tint it (Tahoe-style)',
        });

        const appearanceModel = new Gtk.StringList();
        appearanceModel.append('Follow system');
        appearanceModel.append('Dark glass');
        appearanceModel.append('Light glass');
        const appearanceRow = new Adw.ComboRow({
            title: 'Glass Appearance',
            subtitle: 'Switch light and dark liquid glass independently of the desktop theme',
            model: appearanceModel,
        });
        let currentAppearance = 'system';
        try {
            currentAppearance = settings.get_string('glass-appearance') || 'system';
        } catch (_) {}
        if (currentAppearance === 'dark') appearanceRow.selected = 1;
        else if (currentAppearance === 'light') appearanceRow.selected = 2;
        else appearanceRow.selected = 0;
        appearanceRow.connect('notify::selected', () => {
            const idx = appearanceRow.selected;
            if (idx === 1) settings.set_string('glass-appearance', 'dark');
            else if (idx === 2) settings.set_string('glass-appearance', 'light');
            else settings.set_string('glass-appearance', 'system');
        });
        glassGroup.add(appearanceRow);

        const opacityAdj = new Gtk.Adjustment({
            lower: 0.15,
            upper: 0.95,
            step_increment: 0.01,
            page_increment: 0.05,
            value: settings.get_double('glass-opacity'),
        });
        const opacityRow = new Adw.ActionRow({
            title: 'Glass Tint',
            subtitle: 'Lower shows more wallpaper through the glass',
        });
        const opacityScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: opacityAdj,
            digits: 2,
            hexpand: true,
            width_request: 180,
            valign: Gtk.Align.CENTER,
        });
        opacityScale.set_draw_value(true);
        opacityScale.connect('value-changed', () => {
            settings.set_double('glass-opacity', opacityScale.get_value());
        });
        opacityRow.add_suffix(opacityScale);
        glassGroup.add(opacityRow);

        let blurValue = 32;
        try {
            blurValue = settings.get_int('glass-blur-sigma');
        } catch (_) {}
        const blurAdj = new Gtk.Adjustment({
            lower: 0,
            upper: 60,
            step_increment: 1,
            page_increment: 4,
            value: blurValue,
        });
        const blurRow = new Adw.ActionRow({
            title: 'Backdrop Blur',
            subtitle: '0 turns blur off (saves GPU). Around 32 matches typical liquid glass',
        });
        const blurScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: blurAdj,
            digits: 0,
            hexpand: true,
            width_request: 180,
            valign: Gtk.Align.CENTER,
        });
        blurScale.set_draw_value(true);
        blurScale.connect('value-changed', () => {
            settings.set_int('glass-blur-sigma', Math.round(blurScale.get_value()));
        });
        blurRow.add_suffix(blurScale);
        glassGroup.add(blurRow);

        generalPage.add(glassGroup);

        generalPage.add(generalGroup);

        // 2. Weather Configuration Group
        const weatherGroup = new Adw.PreferencesGroup({
            title: 'Weather Settings',
            description: 'Set custom location or weather preferences',
        });

        const cityRow = new Adw.EntryRow({
            title: 'City Name',
            text: settings.get_string('weather-city') || 'Auto',
        });
        cityRow.connect('apply', () => {
            const val = cityRow.get_text()?.trim() || 'Auto';
            settings.set_string('weather-city', val);
        });
        weatherGroup.add(cityRow);

        const unitsModel = new Gtk.StringList();
        unitsModel.append('Celsius (°C)');
        unitsModel.append('Fahrenheit (°F)');
        const unitsRow = new Adw.ComboRow({
            title: 'Temperature Unit',
            model: unitsModel,
        });
        const currentUnits = settings.get_string('weather-units');
        unitsRow.selected = (currentUnits === 'fahrenheit') ? 1 : 0;
        unitsRow.connect('notify::selected', () => {
            settings.set_string('weather-units', unitsRow.selected === 1 ? 'fahrenheit' : 'celsius');
        });
        weatherGroup.add(unitsRow);

        generalPage.add(weatherGroup);

        // 3. Widgets Toggle Page
        const widgetsPage = new Adw.PreferencesPage({
            title: 'Active Widgets',
            icon_name: 'view-app-grid-symbolic',
        });

        const widgetsGroup = new Adw.PreferencesGroup({
            title: 'Enabled Desktop Widgets',
            description: 'Turn individual widgets on or off',
        });

        const widgetDefs = [
            { id: 'clock', title: 'Clock & Date', desc: 'Displays day, date, and digital time' },
            { id: 'weather', title: 'Weather Forecast', desc: 'Real-time temperature and condition' },
            { id: 'battery', title: 'Battery Percentage', desc: 'Battery meter and charging status' },
            { id: 'bluetooth', title: 'Bluetooth Devices', desc: 'List of connected Bluetooth accessories' },
            { id: 'system', title: 'Activity Monitor', desc: 'CPU, RAM, and Disk utilization' },
            { id: 'media', title: 'Now Playing', desc: 'Media player controls (MPRIS)' },
            { id: 'notes', title: 'Desktop Notes', desc: 'Quick sticky note on desktop' },
        ];

        let enabledWidgets = settings.get_strv('enabled-widgets');

        for (const def of widgetDefs) {
            const row = new Adw.SwitchRow({
                title: def.title,
                subtitle: def.desc,
                active: enabledWidgets.includes(def.id),
            });

            row.connect('notify::active', () => {
                let current = settings.get_strv('enabled-widgets');
                if (row.active && !current.includes(def.id)) {
                    current.push(def.id);
                } else if (!row.active && current.includes(def.id)) {
                    current = current.filter(x => x !== def.id);
                }
                settings.set_strv('enabled-widgets', current);
            });

            widgetsGroup.add(row);
        }

        widgetsPage.add(widgetsGroup);

        window.add(generalPage);
        window.add(widgetsPage);
    }
}
