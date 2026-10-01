import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import { BaseWidget } from './BaseWidget.js';

const _uid = Date.now().toString(36);

export const WeatherWidget = GObject.registerClass(
{
    GTypeName: `WidgetsWeatherWidget_${_uid}`,
},
class WeatherWidget extends BaseWidget {
    _init(settings) {
        super._init('weather', 'Weather', 'weather-few-clouds-symbolic', 'medium', settings);

        this._updateTimerId = 0;
        this._currentCity = 'Loading...';
        this._lat = 0;
        this._lon = 0;
        this._systemSettings = null;

        this._buildUI();
        this._setupLocationListeners();
        this._loadLocationAndFetch();

        // Update weather every 15 minutes
        this._updateTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 900, () => {
            this._fetchWeatherData();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _buildUI() {
        const mainBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
        });

        // Left column: City, Temp, Condition, High/Low
        const leftCol = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.cityLabel = new St.Label({
            text: this._currentCity,
            style_class: 'weather-city',
        });
        leftCol.add_child(this.cityLabel);

        this.tempLabel = new St.Label({
            text: '--°',
            style_class: 'weather-temp',
        });
        leftCol.add_child(this.tempLabel);

        this.conditionLabel = new St.Label({
            text: 'Loading weather...',
            style_class: 'weather-condition',
        });
        leftCol.add_child(this.conditionLabel);

        this.highLowLabel = new St.Label({
            text: 'H: --°  L: --°',
            style_class: 'weather-high-low',
        });
        leftCol.add_child(this.highLowLabel);

        mainBox.add_child(leftCol);

        // Right column: Weather icon + Wind & Humidity stats
        const rightCol = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.weatherIcon = new St.Icon({
            icon_name: 'weather-few-clouds-symbolic',
            style_class: 'weather-icon-large',
        });
        rightCol.add_child(this.weatherIcon);

        const statsBox = new St.BoxLayout({
            vertical: true,
            margin_top: 8,
        });

        this.windLabel = new St.Label({
            text: 'Wind: -- km/h',
            style_class: 'weather-stat-val',
        });
        statsBox.add_child(this.windLabel);

        this.humidityLabel = new St.Label({
            text: 'Humidity: --%',
            style_class: 'weather-stat-val',
        });
        statsBox.add_child(this.humidityLabel);

        rightCol.add_child(statsBox);
        mainBox.add_child(rightCol);

        this.bodyBox.add_child(mainBox);
    }

    _setupLocationListeners() {
        // Listen for extension preference changes
        if (this._settings) {
            this._settings.connect('changed::weather-city', () => {
                this._loadLocationAndFetch();
            });
            this._settings.connect('changed::weather-units', () => {
                this._fetchWeatherData();
            });
        }

        // Listen for GNOME system weather location changes
        try {
            this._systemSettings = new Gio.Settings({ schema_id: 'org.gnome.shell.weather' });
            this._systemSettings.connect('changed::locations', () => {
                const customCity = this._settings?.get_string('weather-city');
                if (!customCity || customCity.trim() === '' || customCity.toLowerCase() === 'auto') {
                    this._loadLocationAndFetch();
                }
            });
        } catch (_) {
            try {
                this._systemSettings = new Gio.Settings({ schema_id: 'org.gnome.Weather' });
                this._systemSettings.connect('changed::locations', () => {
                    const customCity = this._settings?.get_string('weather-city');
                    if (!customCity || customCity.trim() === '' || customCity.toLowerCase() === 'auto') {
                        this._loadLocationAndFetch();
                    }
                });
            } catch (_) {}
        }
    }

    _getSystemLocation() {
        try {
            let s = this._systemSettings;
            if (!s) {
                try {
                    s = new Gio.Settings({ schema_id: 'org.gnome.shell.weather' });
                } catch (_) {
                    s = new Gio.Settings({ schema_id: 'org.gnome.Weather' });
                }
            }
            if (!s) return null;

            const locs = s.get_value('locations');
            if (!locs || locs.n_children() === 0) return null;

            const first = locs.get_child_value(0);
            const inner = first.get_variant();
            const payload = inner.get_child_value(1).get_variant();
            const name = payload.get_child_value(0).get_string()[0];
            const coordsArray = payload.get_child_value(3);
            let lat = 0, lon = 0;
            if (coordsArray && coordsArray.n_children() > 0) {
                const coordTuple = coordsArray.get_child_value(0);
                const latRad = coordTuple.get_child_value(0).get_double();
                const lonRad = coordTuple.get_child_value(1).get_double();
                lat = latRad * 180 / Math.PI;
                lon = lonRad * 180 / Math.PI;
            }
            return { name, lat, lon };
        } catch (e) {
            return null;
        }
    }

    _loadLocationAndFetch() {
        const customCity = this._settings?.get_string('weather-city')?.trim();

        // 1. If custom city is specified and not 'Auto', geocode it
        if (customCity && customCity.toLowerCase() !== 'auto') {
            this.cityLabel.set_text(customCity);
            this._geocodeCity(customCity);
            return;
        }

        // 2. Otherwise, use GNOME system weather location (e.g. Jammu)
        const sysLoc = this._getSystemLocation();
        if (sysLoc && sysLoc.name && (sysLoc.lat !== 0 || sysLoc.lon !== 0)) {
            this._currentCity = sysLoc.name;
            this._lat = sysLoc.lat;
            this._lon = sysLoc.lon;
            this.cityLabel.set_text(this._currentCity);
            this._fetchWeatherData();
            return;
        }

        // 3. Fallback: Jammu default if system has no location configured yet
        this._currentCity = 'Jammu';
        this._lat = 32.689;
        this._lon = 74.838;
        this.cityLabel.set_text(this._currentCity);
        this._fetchWeatherData();
    }

    _geocodeCity(cityName) {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
        const proc = Gio.Subprocess.new(
            ['curl', '-s', '--max-time', '8', url],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (obj, res) => {
            try {
                const [, stdout] = obj.communicate_utf8_finish(res);
                if (stdout) {
                    const data = JSON.parse(stdout);
                    if (data && data.results && data.results.length > 0) {
                        const loc = data.results[0];
                        this._currentCity = loc.name;
                        this._lat = loc.latitude;
                        this._lon = loc.longitude;
                        this.cityLabel.set_text(this._currentCity);
                        this._fetchWeatherData();
                        return;
                    }
                }
            } catch (_) {}

            // If geocoding fails, fallback to system location
            const sysLoc = this._getSystemLocation();
            if (sysLoc) {
                this._currentCity = sysLoc.name;
                this._lat = sysLoc.lat;
                this._lon = sysLoc.lon;
            }
            this.cityLabel.set_text(this._currentCity);
            this._fetchWeatherData();
        });
    }

    _wmoCodeToDetails(code) {
        if (code === 0)
            return { desc: 'Clear Sky', icon: 'weather-clear-symbolic' };
        if (code === 1 || code === 2)
            return { desc: 'Partly Cloudy', icon: 'weather-few-clouds-symbolic' };
        if (code === 3)
            return { desc: 'Overcast', icon: 'weather-overcast-symbolic' };
        if (code >= 45 && code <= 48)
            return { desc: 'Foggy', icon: 'weather-fog-symbolic' };
        if (code >= 51 && code <= 55)
            return { desc: 'Drizzle', icon: 'weather-showers-symbolic' };
        if (code >= 61 && code <= 65)
            return { desc: 'Rain', icon: 'weather-showers-scattered-symbolic' };
        if (code >= 71 && code <= 77)
            return { desc: 'Snowfall', icon: 'weather-snow-symbolic' };
        if (code >= 80 && code <= 82)
            return { desc: 'Rain Showers', icon: 'weather-showers-symbolic' };
        if (code >= 95)
            return { desc: 'Thunderstorm', icon: 'weather-storm-symbolic' };
        return { desc: 'Fair', icon: 'weather-few-clouds-symbolic' };
    }

    _fetchWeatherData() {
        if (this._lat === 0 && this._lon === 0) {
            return;
        }

        const units = this._settings?.get_string('weather-units') || 'celsius';
        const isFahr = (units === 'fahrenheit');
        const unitParam = isFahr ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
        const tempUnitChar = isFahr ? '°F' : '°C';
        const windUnitStr = isFahr ? 'mph' : 'km/h';

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${this._lat}&longitude=${this._lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto${unitParam}`;

        const proc = Gio.Subprocess.new(
            ['curl', '-s', '--max-time', '10', url],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (obj, res) => {
            try {
                const [, stdout] = obj.communicate_utf8_finish(res);
                if (!stdout) return;
                const data = JSON.parse(stdout);
                if (data && data.current) {
                    const temp = Math.round(data.current.temperature_2m);
                    const wind = Math.round(data.current.wind_speed_10m);
                    const humidity = data.current.relative_humidity_2m;
                    const code = data.current.weather_code;

                    let high = '--';
                    let low = '--';
                    if (data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0] !== undefined) {
                        high = Math.round(data.daily.temperature_2m_max[0]);
                        low = Math.round(data.daily.temperature_2m_min[0]);
                    }

                    const details = this._wmoCodeToDetails(code);

                    this.cityLabel.set_text(this._currentCity);
                    this.tempLabel.set_text(`${temp}${tempUnitChar}`);
                    this.conditionLabel.set_text(details.desc);
                    this.weatherIcon.set_icon_name(details.icon);
                    this.highLowLabel.set_text(`H: ${high}°  L: ${low}°`);
                    this.windLabel.set_text(`Wind: ${wind} ${windUnitStr}`);
                    this.humidityLabel.set_text(`Humidity: ${humidity}%`);
                }
            } catch (e) {
                this.conditionLabel.set_text('Offline / Updating');
            }
        });
    }

    destroy() {
        if (this._updateTimerId) {
            GLib.source_remove(this._updateTimerId);
            this._updateTimerId = 0;
        }
        super.destroy();
    }
});
