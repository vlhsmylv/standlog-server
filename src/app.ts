import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import sessionRoutes from "./routes/session";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/api/session", sessionRoutes);

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Invisible Analytics API is running 🚀" });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

export default app;
