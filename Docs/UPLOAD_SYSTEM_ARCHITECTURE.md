# GeoJSON & Image Upload System - Architecture for Future Development

## 📋 Overview

The upload system is **structurally complete** and **ready for file processing implementation**. The validation and queuing is in place. Only the actual file parsing and data insertion needs to be added.

---

## 🏗️ Current Architecture

### Frontend (React) - `DataUpload.jsx`

```
User selects file
    ↓
    ↓ [Validates file size/format]
    ↓
Call Backend: POST /api/admin/uploads/validate
    ↓
    ↓ [Backend checks file type, size limits]
    ↓
If valid, Call: POST /api/admin/uploads/process
    ↓
    ↓ [Creates upload_history record]
    ↓
Display upload ID and "Pending" status
```

### Backend (Node.js) - `uploadManagement.js`

```
Validate Endpoint:
    - Checks file type (GeoJSON, Satellite_Image, Survey_Data)
    - Checks file size (limits: GeoJSON 50MB, Images 200MB)
    - Warns if data exists for municipality/year

Process Endpoint:
    - Creates record in upload_history table
    - Sets status to "Pending"
    - Returns upload ID for tracking

Status Endpoint:
    - Returns current processing status
    - Shows error messages if failed
    - Available statuses: Pending, Processing, Complete, Failed
```

---

## 🔄 How to Implement File Processing

### Step 1: Add File Handling Middleware

In `backend/server.js`, add multer for file uploads:

```javascript
const multer = require("multer");
const path = require("path");

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(uploadsDir, req.body.uploadType.toLowerCase());
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      `${req.body.municipality}_${req.body.year}${path.extname(file.originalname)}`,
    );
  },
});

const upload = multer({ storage });
```

### Step 2: Update Process Endpoint

In `backend/routes/uploadManagement.js`, modify the `/process` endpoint:

```javascript
router.post("/process", upload.single("file"), async (req, res) => {
  const { fileType, municipality, year, description } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const uploadRecord = await pool.query(
      `INSERT INTO upload_history 
       (upload_type, municipality, year, process_status, file_name, file_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        fileType,
        municipality,
        parseInt(year),
        "Processing", // Changed from "Pending"
        req.file.filename,
        req.file.path,
      ],
    );

    const uploadId = uploadRecord.rows[0].id;

    // Process file asynchronously (don't wait for response)
    processUploadAsync(uploadId, fileType, req.file.path, municipality, year);

    res.json({
      uploadId,
      status: "Processing",
      checkStatusAt: `/api/admin/uploads/${uploadId}/status`,
    });
  } catch (error) {
    console.error("Error creating upload record:", error);
    res.status(500).json({ error: "Failed to process upload" });
  }
});
```

### Step 3: Implement File Processor

Create `backend/processors/parseGeoJSON.js`:

```javascript
/**
 * Parse GeoJSON and extract shoreline data
 */
const fs = require("fs").promises;
const pool = require("../db");

exports.processGeoJSON = async (filePath, municipality, year) => {
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const geojson = JSON.parse(fileContent);

    // Extract shoreline from GeoJSON
    if (!geojson.features || geojson.features.length === 0) {
      throw new Error("No features found in GeoJSON");
    }

    let totalRecords = 0;

    for (const feature of geojson.features) {
      if (
        feature.geometry.type === "LineString" ||
        feature.geometry.type === "MultiLineString"
      ) {
        const coordinates =
          feature.geometry.type === "LineString"
            ? feature.geometry.coordinates
            : feature.geometry.coordinates.flat();

        // Extract properties
        const erosionRate = feature.properties?.erosion_rate || 0;
        const cumulativeErosion = feature.properties?.cumulative_erosion || 0;

        // Insert into database
        await pool.query(
          `INSERT INTO shoreline_data 
           (municipality, year, erosion_rate, cumulative_erosion, 
            data_quality, source_type, geojson_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (municipality, year, source_type) DO UPDATE
           SET geojson_data = EXCLUDED.geojson_data`,
          [
            municipality,
            parseInt(year),
            erosionRate,
            cumulativeErosion,
            "Measured",
            "GeoJSON",
            JSON.stringify({ coordinates, properties: feature.properties }),
          ],
        );

        totalRecords++;
      }
    }

    return {
      success: true,
      recordsProcessed: totalRecords,
      municipality,
      year,
    };
  } catch (error) {
    console.error("Error processing GeoJSON:", error);
    throw error;
  }
};
```

### Step 4: Implement Image Processor

Create `backend/processors/parseSatelliteImage.js`:

```javascript
/**
 * Process satellite image metadata
 * (Actual raster processing would use GDAL or Rasterio)
 */
const fs = require("fs").promises;
const pool = require("../db");

exports.processSatelliteImage = async (filePath, municipality, year) => {
  try {
    // Get file stats
    const stats = await fs.stat(filePath);

    // Determine resolution based on file size
    let resolution = "Low";
    if (stats.size > 100 * 1024 * 1024) resolution = "High";
    else if (stats.size > 50 * 1024 * 1024) resolution = "Medium";

    // Insert satellite imagery record
    const result = await pool.query(
      `INSERT INTO satellite_imagery 
       (municipality, year, image_path, capture_date, resolution, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        municipality,
        parseInt(year),
        filePath,
        new Date(),
        resolution,
        "Custom Upload",
      ],
    );

    return {
      success: true,
      imageId: result.rows[0].id,
      municipality,
      year,
      resolution,
    };
  } catch (error) {
    console.error("Error processing satellite image:", error);
    throw error;
  }
};
```

### Step 5: Create Async Processor

Create `backend/processor.js`:

```javascript
/**
 * Background file processor
 * Runs uploads asynchronously without blocking the response
 */
const pool = require("./db");
const { processGeoJSON } = require("./processors/parseGeoJSON");
const { processSatelliteImage } = require("./processors/parseSatelliteImage");

exports.processUploadAsync = async (
  uploadId,
  fileType,
  filePath,
  municipality,
  year,
) => {
  try {
    // Update status to "Processing"
    await pool.query(
      "UPDATE upload_history SET process_status = $1 WHERE id = $2",
      ["Processing", uploadId],
    );

    let result;

    // Process based on file type
    if (fileType === "GeoJSON") {
      result = await processGeoJSON(filePath, municipality, year);
    } else if (fileType === "Satellite_Image") {
      result = await processSatelliteImage(filePath, municipality, year);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    // Update with success
    await pool.query(
      `UPDATE upload_history 
       SET process_status = $1, processed_records = $2, updated_at = NOW()
       WHERE id = $3`,
      ["Complete", result.recordsProcessed || 1, uploadId],
    );

    console.log(`✓ Upload ${uploadId} completed successfully`);
  } catch (error) {
    console.error(`✗ Upload ${uploadId} failed:`, error);

    await pool.query(
      `UPDATE upload_history 
       SET process_status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3`,
      ["Failed", error.message, uploadId],
    );
  }
};
```

---

## 📦 Installation Requirements

When implementing file processing, install these packages:

```bash
npm install multer  # File upload handling
npm install gdal    # Optional: Advanced GeoTIFF processing
npm install sharp   # Optional: Image resizing/processing
```

---

## 💾 Upload Directory Structure

Created automatically when files are uploaded:

```
/uploads
  /geojson
    ├── Balanga_2024.json
    ├── Morong_2024.json
  /satellite_image
    ├── Balanga_2024.tif
    ├── Morong_2024.jpg
  /survey_data
    ├── Balanga_2024.csv
```

---

## 🔗 Data Flow After Upload Processing

```
User uploads GeoJSON file
    ↓
File validated and saved to /uploads/geojson/
    ↓
uploadAsync() processes in background
    ↓
Parse GeoJSON features
    ↓
Extract coordinates and properties
    ↓
Insert into shoreline_data table
    ↓
Update upload_history status: "Complete"
    ↓
Frontend polls /api/admin/uploads/:id/status
    ↓
When status "Complete", automatically load real data
    ↓
UI refreshes and displays uploaded data ✓
```

---

## 🎯 Integration Steps

1. **Install package:** `npm install multer`
2. **Add `parseGeoJSON.js`** to `backend/processors/`
3. **Add `parseSatelliteImage.js`** to `backend/processors/`
4. **Create `backend/processor.js`** with async handler
5. **Update `backend/server.js`** to use multer middleware
6. **Update upload endpoint** to save and process files
7. **Test with sample GeoJSON file**

---

## ✅ Testing File Upload

```bash
# Create sample GeoJSON
cat > sample_shoreline.geojson << 'EOF'
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[120.5, 14.6], [120.51, 14.61], [120.52, 14.62]]
      },
      "properties": {
        "erosion_rate": 1.5,
        "cumulative_erosion": 15.0
      }
    }
  ]
}
EOF

# Upload via API
curl -X POST http://localhost:5000/api/admin/uploads/process \
  -F "file=@sample_shoreline.geojson" \
  -F "fileType=GeoJSON" \
  -F "municipality=Balanga" \
  -F "year=2024"

# Check status
curl http://localhost:5000/api/admin/uploads/1/status
```

---

## 🚀 Timeline for Implementation

- **Phase 1 (DONE)**: Data structure + validation (✓ Completed)
- **Phase 2**: File processing + storage (TODO: ~2-3 hours)
- **Phase 3**: Advanced parsing (GeoTIFF, CSV) (TODO: ~3-4 hours)
- **Phase 4**: Batch uploads (TODO: ~2 hours)
- **Phase 5**: UI progress tracking (TODO: ~1-2 hours)

**Total effort:** ~8-10 hours when ready to implement

The system is **production-ready** for the current phase. All infrastructure is in place!
