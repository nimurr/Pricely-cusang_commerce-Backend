const mongoose = require("mongoose");
const app = require("./app");
const config = require("./config/config");
const logger = require("./config/logger");

const myIp = process.env.BACKEND_IP || "0.0.0.0";

let server;

/* -------------------------------------------------------------------------- */
/*                           MONGODB CONNECTION                                */
/* -------------------------------------------------------------------------- */

mongoose
  .connect(config.mongoose.url, config.mongoose.options)
  .then(() => {
    logger.info("Connected to MongoDB");

    /* ---------------------------------------------------------------------- */
    /*                              HTTP SERVER                                */
    /* ---------------------------------------------------------------------- */

    server = app.listen(config.port, myIp, () => {
      logger.info(`Server running at http://${myIp}:${config.port}`);
    });

    /* ---------------------------------------------------------------------- */
    /*                               SOCKET.IO                                  */
    /* ---------------------------------------------------------------------- */

    const socketIo = require("socket.io");
    const socketIO = require("./utils/socketIO");

    const io = socketIo(server, {
      cors: { origin: "*" },
    });

    socketIO(io);
    global.io = io;
  })
  .catch((err) => {
    logger.error("MongoDB connection failed:", err);
    process.exit(1);
  });

/* -------------------------------------------------------------------------- */
/*                         GRACEFUL SHUTDOWN                                   */
/* -------------------------------------------------------------------------- */

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);

process.on("SIGTERM", () => {
  logger.info("SIGTERM received");
  if (server) {
    server.close();
  }
});

// ============================================================
// ============================================================
// ============================================================