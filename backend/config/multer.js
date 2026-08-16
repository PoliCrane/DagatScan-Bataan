const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Define upload directories
const uploadDir = path.join(__dirname, "../uploads");
const geojsonDir = path.join(uploadDir, "geojson");
const imagesDir = path.join(uploadDir, "satellite-images");
const requestLettersDir = path.join(uploadDir, "request-letters");

// Ensure directories exist
[uploadDir, geojsonDir, imagesDir, requestLettersDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let folder = uploadDir;

    // Determine destination based on file type
    if (file.fieldname === "geojson") {
      folder = geojsonDir;
    } else if (file.fieldname === "satellite") {
      folder = imagesDir;
    } else if (file.fieldname === "request_letter") {
      folder = requestLettersDir;
    }

    cb(null, folder);
  },
  filename: function (req, file, cb) {
    // random name so stored files are unguessable and free of user-controlled characters;
    // a sanitized slug of the original name is kept for admin readability
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
    const slug = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    const filename = `${slug}-${crypto.randomUUID()}${ext}`;

    cb(null, filename);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = {
    geojson: ["application/json", "application/geo+json", "application/octet-stream"],
    satellite: [
      "image/tiff",
      "image/tif",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ],
    request_letter: ["application/pdf"],
  };

  const fieldname = file.fieldname;
  const allowedTypes = allowedMimeTypes[fieldname];

  // For GeoJSON, also check file extension as fallback
  if (fieldname === "geojson") {
    const ext = path.extname(file.originalname).toLowerCase();
    if ((ext === ".json" || ext === ".geojson") &&
        (allowedTypes.includes(file.mimetype) || file.mimetype === "application/octet-stream")) {
      cb(null, true);
      return;
    }
  }

  // Browsers sometimes send application/octet-stream for a PDF too
  if (fieldname === "request_letter") {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".pdf" && (allowedTypes.includes(file.mimetype) || file.mimetype === "application/octet-stream")) {
      cb(null, true);
      return;
    }
  }

  if (allowedTypes && allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type for ${fieldname}. Got ${file.mimetype}`
      ),
      false
    );
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB max
  },
});

// Multer's limits.fileSize is per-instance, not per-fieldname — a signed
// request letter is a scanned document, not a satellite raster, so it gets
// its own instance with a much smaller cap (sharing the same storage/filter).
const uploadRequestLetter = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

module.exports = {
  upload,
  uploadRequestLetter,
  uploadDir,
  geojsonDir,
  imagesDir,
  requestLettersDir,
};
