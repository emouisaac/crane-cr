const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { query } = require("../config/database");
const { env } = require("../config/env");
const { AppError } = require("../utils/errors");

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function calculateSharpness(buffer) {
  let processed;
  try {
    processed = await sharp(buffer)
      .rotate()
      .resize({ width: 320, withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (_error) {
    throw new AppError(400, "This photo format could not be processed. Please upload a clear JPG, PNG, WEBP, or a supported camera image.");
  }

  const { data, info } = processed;

  if (!info.width || !info.height) {
    return 0;
  }

  let scoreTotal = 0;
  let count = 0;
  for (let y = 1; y < info.height; y += 1) {
    for (let x = 1; x < info.width; x += 1) {
      const index = y * info.width + x;
      const current = data[index];
      const left = data[index - 1];
      const top = data[index - info.width];
      scoreTotal += Math.abs(current - left) + Math.abs(current - top);
      count += 2;
    }
  }
  return count ? scoreTotal / count : 0;
}

async function processAndStoreDocument({ file, userId, loanApplicationId, documentType }) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    throw new AppError(400, "Only clear image uploads are supported for verification documents.");
  }

  const sharpnessScore = await calculateSharpness(file.buffer);
  if (sharpnessScore < 12) {
    throw new AppError(400, "Image is too blurry. Please retake the photo in better lighting.");
  }

  let processedBuffer;
  try {
    processedBuffer = await sharp(file.buffer)
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } catch (_error) {
    throw new AppError(400, "This photo format could not be processed. Please upload a clear JPG, PNG, WEBP, or a supported camera image.");
  }

  const sha256Hash = crypto.createHash("sha256").update(processedBuffer).digest("hex");
  const existingHash = await query("SELECT id, user_id FROM documents WHERE sha256_hash = $1", [sha256Hash]);
  if (existingHash.rowCount > 0) {
    throw new AppError(409, "This document image already exists in the system and cannot be reused.");
  }

  const duplicateType = await query(
    `SELECT id FROM documents WHERE loan_application_id = $1 AND document_type = $2`,
    [loanApplicationId, documentType]
  );
  if (duplicateType.rowCount > 0 && documentType !== "additional_document") {
    throw new AppError(409, `A ${documentType.replace(/_/g, " ")} document was already uploaded for this application.`);
  }

  const accountDir = path.join(env.uploadRoot, userId);
  ensureDir(accountDir);
  const storedName = `${loanApplicationId}-${documentType}-${Date.now()}.jpg`;
  const absolutePath = path.join(accountDir, storedName);
  fs.writeFileSync(absolutePath, processedBuffer);

  const result = await query(
    `INSERT INTO documents
      (loan_application_id, user_id, document_type, original_name, stored_name, file_path, mime_type, size_bytes, sha256_hash, sharpness_score, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      loanApplicationId,
      userId,
      documentType,
      file.originalname,
      storedName,
      absolutePath,
      "image/jpeg",
      processedBuffer.length,
      sha256Hash,
      sharpnessScore,
      JSON.stringify({ originalMimeType: file.mimetype })
    ]
  );

  return result.rows[0];
}

module.exports = {
  processAndStoreDocument
};
