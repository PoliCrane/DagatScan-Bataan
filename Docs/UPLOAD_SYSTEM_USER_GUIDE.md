# Data Upload System - Quick Reference Guide

## What's New

The Coastal Erosion Monitoring System now has a powerful **Data Upload Center** allowing administrators to upload:
- 📍 **GeoJSON Datasets** - Shoreline vector data with erosion metrics
- 🛰️ **Satellite Imagery** - High-resolution raster data for coastal analysis

## Getting Started

### Access the Upload Page
1. Login to the Admin Dashboard
2. Navigate to **Data Upload** in the sidebar
3. You'll see the upload interface with two main sections

## Upload Process

### Step 1: Select Your Data
Choose one or both files:
- **GeoJSON Dataset** (`.json`, `.geojson`, max 50MB)
  - Must contain erosionRate or change_meters in properties
  - Will be parsed and erosion metrics calculated automatically

- **Satellite Image** (`.tif`, `.jpg`, `.png`, max 200MB)
  - High-resolution imagery for visual reference
  - Metadata automatically extracted and stored

### Step 2: Enter Location Details

Fill in the required information:
| Field | Purpose | Options |
|-------|---------|---------|
| **Municipality*** | Which municipality | Balanga, Bataan, Dinalupihan, Hermosa, Limay, Morong, Orani, Orion, Pilar, Samal |
| **Specific Area*** | Coastal zone/location | Free text - e.g., "Balanga Bay", "Coastal Zone A" |
| **Year of Data*** | When this data was collected | 2004-2024 |
| **Data Quality** | Confidence level | Measured (High) / Estimated (Medium) / Simulated (Low) |
| **Latitude** | Optional GPS reference | Decimal format (14.6891) |
| **Longitude** | Optional GPS reference | Decimal format (120.3456) |
| **Description** | Additional notes | Any relevant information |

### Step 3: Upload and Process
1. Click **"📤 Upload Files"** button
2. Monitor the progress bar (shows transfer progress)
3. System automatically:
   - Validates file format
   - Parses GeoJSON or processes image
   - Calculates erosion metrics
   - Stores data in database
   - Creates audit trail

### Step 4: View Results
After upload completes, you'll see:
- ✓ Success or ✗ Error status
- Number of records processed
- Any error messages if processing failed

## GeoJSON Format Requirements

Your GeoJSON file should contain coastline/erosion data in this format:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng, lat], [lng, lat], ...]]
      },
      "properties": {
        "erosionRate": -2.3,
        "area": "Balanga Bay",
        "source": "Satellite Analysis"
      }
    }
  ]
}
```

### Required Properties
- **erosionRate** OR **change_meters** - Negative values indicate erosion (meters/year)

### Optional Properties
- **cumulativeChange** - Total change since baseline (meters)
- **area** or **name** - Feature name/description
- **source** - Data source description
- **data_quality** - "Measured", "Estimated", or "Simulated"

## Information Panels

### 📋 Accepted Formats
- GeoJSON: `.json`, `.geojson` (includes vector data)
- Satellite: `.tif`, `.jpg`, `.png` (raster imagery)
- Size limits enforced automatically

### 🔍 GeoJSON Properties
List of expected data fields in your GeoJSON properties

### ⚙️ Processing Details
How files are validated, processed, and stored

## Troubleshooting

### Upload Failed - Invalid File Format
- Check file extension (.json for GeoJSON, .jpg/.png for images)
- Verify file is not corrupted
- Try uploading again

### Upload Failed - File Too Large
- GeoJSON: Maximum 50MB
- Satellite: Maximum 200MB
- Compress or split large files

### Upload Failed - Invalid GeoJSON
- Ensure file is valid JSON (check syntax)
- Include required erosionRate field in properties
- Verify coordinate format: [longitude, latitude]

### Upload Failed - Missing Required Fields
- Fill in all required fields (marked with *)
- Municipality must be selected
- Year is required for data tracking

### Nothing Happens After Click Upload
- Check internet connection
- Look for error message below
- Try uploading a smaller test file first
- Check browser console for technical errors

## Best Practices

### ✓ Do's
- ✓ Use accurate geographic coordinates
- ✓ Ensure erosion metrics are in consistent units (meters)
- ✓ Include meaningful area descriptions
- ✓ Upload satellite images with same year as GeoJSON
- ✓ Validate GeoJSON before uploading (use online validators)
- ✓ Check upload history to confirm success

### ✗ Don'ts
- ✗ Upload corrupted or incomplete files
- ✗ Use inconsistent coordinate systems
- ✗ Mix different time periods in one upload
- ✗ Forget to fill in location details
- ✗ Upload extremely large files without splitting

## Example Workflow

### Upload Coastal Monitoring Data for Balanga 2024

1. **Prepare GeoJSON**
   ```json
   {
     "type": "FeatureCollection",
     "features": [{
       "geometry": {"type": "Polygon", "coordinates": [[[120.5, 14.6], [120.51, 14.6]]]},
       "properties": {
         "erosionRate": -1.8,
         "area": "Balanga Main Coastal Zone",
         "source": "2024 Satellite Survey"
       }
     }]
   }
   ```

2. **Prepare Satellite Image** (recent satellite photo)

3. **Access Upload Center**
   - Navigate to Admin → Data Upload

4. **Upload GeoJSON**
   - Drag file to GeoJSON zone
   - Select: Balanga, "Balanga Main Coastal Zone", 2024
   - Click Upload

5. **Upload Satellite Image**
   - Drag image to Satellite zone
   - Same location details
   - Click Upload

6. **Verify Results**
   - Check success notifications
   - Review upload history

## Data Features After Upload

Once uploaded, your data becomes available for:
- 📊 **Erosion Analysis** - Track coastal changes over time
- 🗺️ **Coastal Monitoring** - View data on interactive maps
- 📄 **Reports** - Generate analysis reports
- 📈 **Trends** - Analyze historical patterns

## Questions or Issues?

Contact your system administrator for:
- Technical support
- Data format questions
- Upload troubleshooting
- Historical data queries

---

**Happy uploading!** 🚀

For detailed technical documentation, see: `UPLOAD_SYSTEM_COMPLETE.md`
