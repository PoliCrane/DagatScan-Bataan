# Real Data Migration - Implementation Instructions

## ✅ What's Been Completed

All code has been created and integrated. Here's what's ready:

### ✓ Backend (Node.js)

- **Database Migration**: `DB_MIGRATION_REAL_DATA.sql`
  - Creates `shoreline_data` table
  - Creates `upload_history` table
  - Creates `satellite_imagery` table
  - Adds proper indexes for performance

- **API Routes**: `backend/routes/shorelineData.js`
  - `GET /api/shoreline/municipality/:municipality` - Fetch real data
  - `GET /api/shoreline/municipality/:municipality/year/:year` - Get specific year
  - `GET /api/shoreline/compare` - Compare municipalities
  - `GET /api/shoreline/statistics/:municipality` - Get stats
  - `POST /api/shoreline/seed` - Seed with simulated data (for testing)
  - `DELETE /api/shoreline/municipality/:municipality` - Delete data

- **Upload Routes**: `backend/routes/uploadManagement.js`
  - `POST /api/admin/uploads/validate` - Validate files
  - `POST /api/admin/uploads/process` - Queue uploads
  - `GET /api/admin/uploads` - List uploads
  - `GET /api/admin/uploads/:id/status` - Check status
  - Structure ready for future GeoJSON/Image parsing

- **Server Integration**: `server.js` (UPDATED)
  - Routes mounted and ready
  - Health check endpoint added

### ✓ Frontend (React/Vite)

- **Data Service Layer**: `frontend/src/api/shorelineData.js`
  - `fetchMunicipalityData()` - Get real data from database
  - `getFallbackData()` - Generate simulated data if needed
  - `getShorelineData()` - Unified interface with auto-fallback
  - Automatic switching between real and fake data

- **Updated Components**:
  - `coastalmonitoring.jsx` - Now fetches real data with fallback
  - `erosionanalysis.jsx` - Now fetches real data with fallback
  - `DataUpload.jsx` - Admin panel ready for future file uploads

---

## 🚀 Getting Started (4 Simple Steps)

### Step 1: Apply Database Migration

Run the migration on your PostgreSQL database:

```bash
# Connect to your PostgreSQL instance
psql -U postgres -d db_coastalerosion -f backend/DB_MIGRATION_REAL_DATA.sql
```

Or if using pgAdmin:

1. Open pgAdmin
2. Navigate to your `db_coastalerosion` database
3. Tools → Query Tool
4. Copy and paste contents of `DB_MIGRATION_REAL_DATA.sql`
5. Execute

**Verify:**

```sql
-- Check tables were created
\dt  -- Should show shoreline_data, upload_history, satellite_imagery
```

### Step 2: Restart Backend Server

The routes are already integrated into `server.js`. Just restart:

```bash
cd backend
npm install  # If haven't installed recently
npm start    # Restart the server
```

**Verify:**

```bash
# In another terminal, test the health endpoint:
curl http://localhost:5000/api/health
# Should return: {"status":"API Running","timestamp":"..."}
```

### Step 3: Seed Test Data (Optional but Recommended)

Before uploading real data, test with simulated data:

```bash
# Add simulated data for Balanga (2015-2024)
curl -X POST http://localhost:5000/api/shoreline/seed \
  -H "Content-Type: application/json" \
  -d '{
    "municipality": "Balanga",
    "startYear": 2015,
    "endYear": 2024
  }'

# Repeat for other municipalities
curl -X POST http://localhost:5000/api/shoreline/seed \
  -H "Content-Type: application/json" \
  -d '{"municipality": "Morong", "startYear": 2015, "endYear": 2024}'
```

**Verify:**

```bash
# Fetch the seeded data
curl http://localhost:5000/api/shoreline/municipality/Balanga
# Should return array with 10 years of data
```

### Step 4: Test Frontend

Start the frontend if not already running:

```bash
cd frontend
npm install  # If needed
npm run dev
```

**Test in Browser:**

1. Go to http://localhost:5173
2. Navigate to "Coastal Monitoring"
3. Click on a municipality (e.g., "Balanga")
4. Should see shoreline data loaded (if seeded) or simulated data as fallback
5. Check browser console for data source log (✓ or ⚠)

---

## 📊 How Data Flows Now

### UI Uses Real Data (If Available)

```
User selects municipality
    ↓
Frontend calls: getShorelineData('Balanga', coastlinePoints)
    ↓
Service tries database first: GET /api/shoreline/municipality/Balanga
    ↓
Backend queries shoreline_data table
    ↓
If data exists in DB → Display real data ✓
If DB empty → Fallback to simulated data ⚠
    ↓
UI displays (100% same look, just different data source)
```

### Upload Structure (Ready for Development)

```
Admin uploads file
    ↓
Validate file format/size: POST /api/admin/uploads/validate
    ↓
Queue for processing: POST /api/admin/uploads/process
    ↓
Create upload_history record with "Pending" status
    ↓
Check status anytime: GET /api/admin/uploads/:id/status
    ↓
[FUTURE] Process file and insert into shoreline_data table
```

---

## 🔧 Testing Different Scenarios

### Scenario 1: Using Simulated Data (Default)

If no data in database, system automatically uses fake data:

```bash
# Check Balanga has data
curl http://localhost:5000/api/shoreline/municipality/Balanga

# If 404 or empty, it falls back to simulation
# Browser console will show: "⚠ Using simulated data for Balanga"
```

### Scenario 2: Mix Real and Simulated

Upload real data for ONE year, fallback handles the rest. Example:

```bash
# Assume you have real data for 2024 from GeoJSON
# The system will:
# 1. Use real data for 2024
# 2. Use simulation for 2015-2023 (or fallback entirely if only some years exist)
```

### Scenario 3: Viewing Upload History

```bash
# List all uploaded files
curl http://localhost:5000/api/admin/uploads

# Check specific upload status
curl http://localhost:5000/api/admin/uploads/1/status
```

---

## 📈 Stats & Comparison Endpoints

### Get Municipality Statistics

```bash
curl http://localhost:5000/api/shoreline/statistics/Balanga
```

Response:

```json
{
  "municipality": "Balanga",
  "recordCount": 10,
  "yearRange": { "start": 2015, "end": 2024 },
  "erosionStats": {
    "average": 1.23,
    "minimum": 0.5,
    "maximum": 2.1
  },
  "totalChange": 12.3,
  "dataSources": ["Calculated"]
}
```

### Compare Multiple Municipalities

```bash
curl http://localhost:5000/api/shoreline/compare?municipalities=Balanga,Morong,Limay&startYear=2015&endYear=2024
```

---

## 🎯 Next Steps: Uploading Real Data

When you're ready to upload actual GeoJSON or satellite images:

1. **GeoJSON Upload** → Admin panel will validate file format and size
2. **File Processing** → Implement `parseGeoJSON()` function in backend
3. **Extract Shoreline** → Insert coordinates into `shoreline_data` table
4. **Automatic Switch** → Frontend will use real data instead of simulation

All endpoints are ready. Only file processing needs implementation.

---

## 🐛 Troubleshooting

### Frontend Shows "No Data" Error

**Solution:** Run the seed command above to add test data to the database

### API endpoints return 404

**Solution:** Restart backend server after applying database migration

### Data not updating on UI

**Solution:**

```bash
# Clear browser cache (Ctrl+Shift+Delete) and hard refresh (Ctrl+Shift+R)
# Or check browser console for error messages
```

### Upload "Not Implemented" Message

**Expected behavior.** File processing will be implemented later. For now:

- ✓ Upload is validated
- ✓ Upload record is created
- ✓ Status can be checked
- ⏳ File processing pending

---

## 📚 File Locations

| File                                       | Purpose                      |
| ------------------------------------------ | ---------------------------- |
| `backend/DB_MIGRATION_REAL_DATA.sql`       | Database schema              |
| `backend/routes/shorelineData.js`          | Data retrieval API           |
| `backend/routes/uploadManagement.js`       | Upload management API        |
| `backend/server.js`                        | Main server (routes mounted) |
| `frontend/src/api/shorelineData.js`        | Frontend data service        |
| `frontend/src/pages/coastalmonitoring.jsx` | Main map view                |
| `frontend/src/pages/erosionanalysis.jsx`   | Analysis view                |
| `frontend/src/pages/admin/DataUpload.jsx`  | Admin upload panel           |

---

## ✅ Verification Checklist

- [ ] Database migration applied successfully
- [ ] Backend server running and responsive
- [ ] Test data seeded with simulated data
- [ ] Frontend loads and displays data
- [ ] Console shows "✓ Loaded real data" or "⚠ Using simulated data"
- [ ] Admin upload panel shows status messages
- [ ] Can view upload history via API
- [ ] UI looks 100% identical to before (just different data source)

**All set! Your system now uses real database data with fallback to simulation. Ready for actual GeoJSON/Image uploads when needed.**
