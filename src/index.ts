import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./routes/index.js";
import "dotenv/config";
import authRoutes from "./routes/auth.routes.js";
import dormRoutes from "./routes/dorm.routes.js";
import repairRoutes from "./routes/repair.routes.js";
import parcelRoutes from "./routes/parcel.routes.js";

dotenv.config();

const app = express();
app.get("/", (req, res) => {
  res.send("RentSphere API running");
});

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    credentials: true,
  })
);

// เก็บ rawBody ไว้สำหรับ LINE signature verification
app.use(
  express.json({
    limit: "25mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// health check
app.get("/ping", (_req, res) => {
  res.json({ message: "pong" });
});

// mount api
app.use("/api/v1", apiRoutes);
app.use("/auth", authRoutes);
app.use("/dorm", dormRoutes);
app.use("/repair", repairRoutes);
app.use("/parcel", parcelRoutes);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});