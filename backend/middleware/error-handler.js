const { AppError } = require("../utils/errors");

function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      details: error.details || null
    });
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Uploaded file is too large." });
  }

  console.error(error);
  return res.status(500).json({
    error: "An unexpected server error occurred."
  });
}

module.exports = { errorHandler };
