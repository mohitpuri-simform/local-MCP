import cors from "cors";
import express, { Request, Response } from "express";
import { generateDummyWeather } from "./weather";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "weather-backend" });
});

app.get("/api/weather/:city", (req: Request, res: Response) => {
  const city = req.params.city;
  if (!city || !city.trim()) {
    res.status(400).json({ error: "City is required." });
    return;
  }

  const weather = generateDummyWeather(city);
  res.json(weather);
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
