/**
 * 顶栏天气小组件。
 *
 * 数据来自 Open-Meteo 公共接口：默认用后台配置的坐标，
 * 开启「自动定位」时会先问访客要地理位置，失败再回落到配置坐标。
 */
import { formatMessage, messages } from "../shared/i18n";

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

type WeatherCoordinates = {
  label: string;
  latitude: number;
  longitude: number;
};

const getWeatherMeta = (code: number) => {
  if (code === 0) {
    return { icon: "solar:sun-2-linear", label: messages.weather.conditionClear };
  }

  if ([1, 2].includes(code)) {
    return { icon: "solar:cloud-sun-2-linear", label: messages.weather.conditionMostlyClear };
  }

  if (code === 3) {
    return { icon: "solar:cloud-linear", label: messages.weather.conditionOvercast };
  }

  if ([45, 48].includes(code)) {
    return { icon: "solar:cloud-fog-linear", label: messages.weather.conditionFog };
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return { icon: "solar:cloud-sun-rain-linear", label: messages.weather.conditionDrizzle };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { icon: "solar:cloud-rain-linear", label: messages.weather.conditionRain };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { icon: "solar:cloud-snowfall-linear", label: messages.weather.conditionSnow };
  }

  if ([95, 96, 99].includes(code)) {
    return { icon: "solar:cloud-bolt-linear", label: messages.weather.conditionThunderstorm };
  }

  return { icon: "solar:cloud-linear", label: messages.weather.conditionCloudy };
};

export const setupWeather = () => {
  const widget = document.querySelector<HTMLElement>("[data-weather-widget]");
  const icon = widget?.querySelector<HTMLElement>("[data-weather-icon]");
  const location = widget?.querySelector<HTMLElement>("[data-weather-location-label]");
  const temperature = widget?.querySelector<HTMLElement>("[data-weather-temperature]");

  if (!widget || !icon || !location || !temperature) {
    widget?.setAttribute("hidden", "");
    return;
  }

  const fallback: WeatherCoordinates = {
    label: widget.dataset.weatherLocation?.trim() || messages.weather.defaultLabel,
    latitude: Number(widget.dataset.weatherLatitude),
    longitude: Number(widget.dataset.weatherLongitude),
  };
  const preferVisitorLocation = widget.dataset.weatherAutoLocation !== "false";

  if (!Number.isFinite(fallback.latitude) || !Number.isFinite(fallback.longitude)) {
    widget.setAttribute("hidden", "");
    return;
  }

  const loadWeather = (coordinates: WeatherCoordinates, fallBackOnFailure: boolean) => {
    location.textContent = coordinates.label;
    const params = new URLSearchParams({
      current: "temperature_2m,weather_code",
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      timezone: "auto",
    });

    void fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Weather API failed: ${response.status}`);
        }

        return response.json() as Promise<OpenMeteoResponse>;
      })
      .then((payload) => {
        const value = payload.current?.temperature_2m;
        const code = payload.current?.weather_code;

        if (
          typeof value !== "number" ||
          typeof code !== "number" ||
          !Number.isFinite(value) ||
          !Number.isFinite(code)
        ) {
          throw new Error("Weather API returned incomplete data");
        }

        const weather = getWeatherMeta(code);
        const roundedTemperature = Math.round(value);
        icon.setAttribute("icon", weather.icon);
        temperature.textContent = `${roundedTemperature}°`;
        widget.setAttribute(
          "aria-label",
          formatMessage(
            messages.weather.summary,
            coordinates.label,
            weather.label,
            String(roundedTemperature),
          ),
        );
      })
      .catch(() => {
        if (fallBackOnFailure) {
          loadWeather(fallback, false);
          return;
        }

        widget.setAttribute("hidden", "");
      });
  };

  if (!preferVisitorLocation || !("geolocation" in navigator)) {
    loadWeather(fallback, false);
    return;
  }

  location.textContent = messages.weather.locating;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        loadWeather(fallback, false);
        return;
      }

      loadWeather({ label: messages.weather.currentLocation, latitude, longitude }, true);
    },
    () => loadWeather(fallback, false),
    { enableHighAccuracy: false, maximumAge: 900000, timeout: 6000 },
  );
};
