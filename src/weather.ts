export type WeatherCondition =
  | "Sunny"
  | "Partly Cloudy"
  | "Cloudy"
  | "Rain"
  | "Thunderstorm"
  | "Snow"
  | "Windy"
  | "Fog";

export interface WeatherData {
  city: string;
  location: {
    latitude: number;
    longitude: number;
  };
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windSpeedKmph: number;
  condition: WeatherCondition;
  generatedAt: string;
}

const conditions: WeatherCondition[] = [
  "Sunny",
  "Partly Cloudy",
  "Cloudy",
  "Rain",
  "Thunderstorm",
  "Snow",
  "Windy",
  "Fog",
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function deriveCityCoordinates(city: string): {
  latitude: number;
  longitude: number;
} {
  const seed = hashString(city.trim().toLowerCase());
  const latitude = (seed % 18000) / 100 - 90;
  const longitude = (((seed / 7) | 0) % 36000) / 100 - 180;

  return {
    latitude: Number(latitude.toFixed(4)),
    longitude: Number(longitude.toFixed(4)),
  };
}

function pickCondition(temp: number, humidity: number): WeatherCondition {
  if (temp <= 0) return "Snow";
  if (humidity > 82 && temp > 20)
    return Math.random() > 0.6 ? "Thunderstorm" : "Rain";
  if (humidity > 68) return Math.random() > 0.5 ? "Cloudy" : "Rain";
  if (humidity > 50) return "Partly Cloudy";
  if (temp > 34) return "Sunny";

  return conditions[Math.floor(Math.random() * conditions.length)];
}

export function generateDummyWeather(city: string): WeatherData {
  const normalizedCity = city.trim();
  const safeCity = normalizedCity.length > 0 ? normalizedCity : "Unknown";
  const location = deriveCityCoordinates(safeCity);

  const latFactor = 1 - Math.abs(location.latitude) / 90;
  const baseTemp = -5 + latFactor * 40;

  const humidity = Math.round(randomInRange(30, 95));
  const temperatureC = Number((baseTemp + randomInRange(-6, 6)).toFixed(1));
  const feelsLikeC = Number((temperatureC + randomInRange(-3, 3)).toFixed(1));
  const windSpeedKmph = Number(randomInRange(3, 35).toFixed(1));
  const condition = pickCondition(temperatureC, humidity);

  return {
    city: safeCity,
    location,
    temperatureC,
    feelsLikeC,
    humidity,
    windSpeedKmph,
    condition,
    generatedAt: new Date().toISOString(),
  };
}
