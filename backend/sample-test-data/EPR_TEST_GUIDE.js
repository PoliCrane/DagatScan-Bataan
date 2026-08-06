/**
 * Test Script for EPR Calculation & Auto-Calculation Feature
 * 
 * This script demonstrates how to test the EPR system
 */

const calculateEPR = require("../services/eprCalculator");

/**
 * TEST 1: Direct Function Call
 * Calculate EPR between Bagac 2020 and 2025 shorelines
 */
console.log("========== TEST 1: Direct EPR Calculation ==========\n");

// Bagac 2020 - Northern Coastal Zone
const bagac2020 = [
  [120.450000, 14.750000],
  [120.450050, 14.750050],
  [120.450100, 14.750100],
  [120.450150, 14.750150],
  [120.450200, 14.750200],
];

// Bagac 2025 - Northern Coastal Zone (slightly retreated)
const bagac2025 = [
  [120.449955, 14.749955],
  [120.450005, 14.750005],
  [120.450055, 14.750055],
  [120.450105, 14.750105],
  [120.450155, 14.750155],
];

try {
  const result = calculateEPR(bagac2020, bagac2025, 2020, 2025);
  console.log("✅ Northern Coastal Zone - Bagac:");
  console.log(`   Erosion Rate: ${result.erosionRate.toFixed(3)} m/year`);
  console.log(`   Distance Change: ${result.distanceChange.toFixed(1)} meters`);
  console.log(`   Years Apart: ${result.yearsApart} years\n`);
} catch (error) {
  console.error("❌ Error:", error.message);
}

/**
 * TEST 2: HTTP Request to API Endpoint
 * You can test this with curl or Postman
 */
console.log("========== TEST 2: HTTP API Endpoint ==========\n");
console.log("POST http://localhost:5000/api/calculate-epr");
console.log("Content-Type: application/json\n");
console.log("Request Body:");
console.log(
  JSON.stringify(
    {
      coords1: bagac2020,
      coords2: bagac2025,
      year1: 2020,
      year2: 2025,
    },
    null,
    2
  )
);
console.log("\n");

/**
 * TEST 3: cURL Command to Test API
 */
console.log("========== TEST 3: cURL Command ==========\n");
console.log(`curl -X POST http://localhost:5000/api/calculate-epr \\
  -H "Content-Type: application/json" \\
  -d '{
    "coords1": [[120.45, 14.75], [120.46, 14.76], [120.47, 14.77], [120.48, 14.78], [120.49, 14.79]],
    "coords2": [[120.448, 14.748], [120.458, 14.758], [120.468, 14.768], [120.478, 14.778], [120.488, 14.788]],
    "year1": 2020,
    "year2": 2025
  }'\n`);

/**
 * TEST 4: Upload Workflow (Manual Testing)
 */
console.log("========== TEST 4: GeoJSON Upload Workflow ==========\n");
console.log("Files available for upload in sample-test-data/:\n");
console.log("1. bagac-2020.geojson   (Municipality: Bagac, Year: 2020)");
console.log("   - Northern Coastal Zone (NO erosionRate)");
console.log("   - Central Beach Area (NO erosionRate)");
console.log("   - Southern Cove (NO erosionRate)\n");

console.log("2. bagac-2025.geojson   (Municipality: Bagac, Year: 2025)");
console.log("   - Northern Coastal Zone (NO erosionRate - will auto-calculate from 2020)");
console.log("   - Central Beach Area (NO erosionRate - will auto-calculate from 2020)");
console.log("   - Southern Cove (NO erosionRate - will auto-calculate from 2020)\n");

console.log("3. morong-2020.geojson  (Municipality: Morong, Year: 2020)");
console.log("4. morong-2025.geojson  (Municipality: Morong, Year: 2025)\n");

console.log("UPLOAD SEQUENCE:");
console.log("1. Upload bagac-2020.geojson first (establishes baseline)");
console.log("2. Upload bagac-2025.geojson (triggers auto-calculation)");
console.log("3. Check database - Northern Coastal Zone & Southern Cove should have erosionRate\n");

console.log("EXPECTED AUTO-CALCULATION RESULTS:");
console.log("- Northern Coastal Zone: ~-0.50 m/year (retreating ~2.5m in 5 years)");
console.log("- Central Beach Area: ~-0.30 m/year (retreating ~1.5m in 5 years)");
console.log("- Southern Cove: ~-1.20 m/year (retreating ~6.0m in 5 years)");
console.log("- All zones are auto-calculated (no pre-existing erosionRate to skip)\n");

/**
 * TEST 5: Error Cases
 */
console.log("========== TEST 5: Error Handling ==========\n");

// Empty arrays
try {
  calculateEPR([], bagac2025, 2020, 2025);
} catch (error) {
  console.log("✅ Empty array error caught:", error.message);
}

// Same year
try {
  calculateEPR(bagac2020, bagac2025, 2020, 2020);
} catch (error) {
  console.log("✅ Same year error caught:", error.message);
}

// Invalid coordinates
try {
  calculateEPR([[200, 50]], bagac2025, 2020, 2025);
} catch (error) {
  console.log("✅ Invalid coordinate error caught:", error.message);
}

console.log("\n========== Tests Complete ==========\n");
