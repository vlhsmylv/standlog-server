import app from "./app";
import prisma from "./prisma";

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("Connected to database");

    // Start Express server
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
