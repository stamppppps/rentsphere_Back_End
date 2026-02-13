import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./routes/index.js";
import "dotenv/config";
import usersRoutes from "./routes/users.routes.js";
import authRoutes from "./routes/auth.routes.js";



dotenv.config();

const app = express();



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

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// health check
app.get("/ping", (_req, res) => {
  res.json({ message: "pong" });
});


// mount api
app.use("/api/v1",apiRoutes);
app.use("/auth", authRoutes);


app.use(apiRoutes);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
