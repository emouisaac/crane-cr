const multer = require("multer");
const { AppError } = require("../utils/errors");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new AppError(400, "Only image uploads are allowed."));
    }
    return cb(null, true);
  }
});

module.exports = { upload };
