# EPR Implementation Guide - Step-by-Step

## Overview: Why Switch to EPR?

| Current Method | EPR Method |
|---|---|
| **Calculation:** `generateMunicipalityErosionRate()` → seeded RNG | **Calculation:** `EPR = (pos_final - pos_initial) / time` |
| **Complexity:** 🔴 High (3+ functions, simulation) | **Complexity:** 🟢 Low (1 formula) |
| **Performance:** 🟡 Medium (recalculates each time) | **Performance:** 🟢 Fast (single lookup) |
| **Database:** ⚠️ Needs annual data | **Database:** ✓ Only needs 2 endpoints |
| **Accuracy:** 🔴 Simulated | **Accuracy:** 🟢 Real data-based |
| **Code Maintenance:** 🔴 Complex | **Maintenance:** 🟢 Simple |

---

## Step 1: Update Database Schema

### Create EPR Storage Table

```sql
-- Option A: Minimal (recommended for quick implementation)
ALTER TABLE shoreline_zones 
ADD COLUMN epr_rate DECIMAL(10,4);

-- Option B: Complete (for production)
CREATE TABLE municipality_epr (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(100) UNIQUE NOT NULL,
  epr_rate DECIMAL(10,4) NOT NULL,
  confidence DECIMAL(3,2),            -- 0-1 (0.8 = 80%)
  base_year INTEGER,                  -- e.g., 2026
  calculation_method VARCHAR(50),     -- 'Linear', 'LLS', 'Polynomial'
  data_points_used INTEGER,           -- how many years of data
  calculated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Step 2: Calculate EPR from Existing Data

### Backend Route: Calculate EPR

```javascript
// backend/routes/shorelineData.js

/**
 * Calculate EPR (End Point Rate) for a municipality
 * EPR = (end_position - start_position) / (end_year - start_year)
 */
router.post("/municipality/:municipality/calculate-epr", async (req, res) => {
  try {
    const { municipality, startYear = 2015, endYear = 2026 } = req.body;

    // Get first and last year data
    const result = await pool.query(
      `SELECT 
        year, 
        cumulative_erosion,
        AVG(erosion_rate) as avg_rate
      FROM shoreline_zones
      WHERE LOWER(municipality) = LOWER($1) 
        AND year IN ($2, $3)
      GROUP BY year, cumulative_erosion
      ORDER BY year`,
      [municipality, startYear, endYear]
    );

    if (result.rows.length < 2) {
      return res.status(400).json({
        error: `Need data for at least 2 years. Found: ${result.rows.length}`
      });
    }

    const startData = result.rows[0];
    const endData = result.rows[result.rows.length - 1];

    // Calculate EPR: change in erosion / time elapsed
    const totalChange = parseFloat(endData.cumulative_erosion) - parseFloat(startData.cumulative_erosion);
    const yearsElapsed = parseInt(endData.year) - parseInt(startData.year);
    const epr = totalChange / yearsElapsed;

    // Store EPR in database
    await pool.query(
      `INSERT INTO municipality_epr 
       (municipality, epr_rate, base_year, calculation_method, data_points_used, calculated_at)
       VALUES ($1, $2::DECIMAL, $3::INTEGER, 'Linear', $4::INTEGER, NOW())
       ON CONFLICT (municipality) 
       DO UPDATE SET epr_rate = $2::DECIMAL, updated_at = NOW(), calculated_at = NOW()`,
      [municipality, parseFloat(epr.toFixed(4)), parseInt(endYear), result.rows.length]
    );

    res.json({
      municipality,
      epr: parseFloat(epr.toFixed(4)),
      yearRange: { start: startData.year, end: endData.year },
      totalErosion: parseFloat(totalChange.toFixed(2)),
      yearsElapsed,
      message: "EPR calculated successfully"
    });
  } catch (err) {
    console.error("Error calculating EPR:", err);
    res.status(500).json({ error: "Failed to calculate EPR" });
  }
});

/**
 * Get EPR for a municipality
 * If not calculated, calculate from latest data
 */
router.get("/municipality/:municipality/epr", async (req, res) => {
  try {
    const { municipality } = req.params;

    // Try to get cached EPR
    const eprResult = await pool.query(
      "SELECT epr_rate, base_year FROM municipality_epr WHERE LOWER(municipality) = LOWER($1)",
      [municipality]
    );

    if (eprResult.rows.length > 0) {
      return res.json({
        municipality,
        epr: parseFloat(eprResult.rows[0].epr_rate),
        source: "cached",
        baseYear: eprResult.rows[0].base_year
      });
    }

    // If not cached, calculate from shoreline data
    const dataResult = await pool.query(
      `SELECT CAST(year AS INTEGER) as year, CAST(cumulative_erosion AS FLOAT) as cumulative_erosion
       FROM shoreline_zones
       WHERE LOWER(municipality) = LOWER($1)
       ORDER BY year ASC`,
      [municipality]
    );

    if (dataResult.rows.length < 2) {
      return res.status(404).json({ error: "Insufficient data for EPR calculation" });
    }

    const firstYear = dataResult.rows[0];
    const lastYear = dataResult.rows[dataResult.rows.length - 1];
    const epr = (parseFloat(lastYear.cumulative_erosion) - parseFloat(firstYear.cumulative_erosion)) 
              / (parseInt(lastYear.year) - parseInt(firstYear.year));

    res.json({
      municipality,
      epr: parseFloat(epr.toFixed(4)),
      source: "calculated",
      yearRange: {
        start: firstYear.year,
        end: lastYear.year
      }
    });
  } catch (err) {
    console.error("Error fetching EPR:", err);
    res.status(500).json({ error: "Failed to fetch EPR" });
  }
});
```

---

## Step 3: Create EPR Utility Functions

### Frontend Utility Module

```javascript
// frontend/src/utils/eprUtils.js

/**
 * Calculate position at target year using EPR
 * 
 * @param {number} referencePosition - Position at reference year (e.g., 2026)
 * @param {number} epr - End Point Rate (m/year), negative = erosion
 * @param {number} targetYear - Year to predict/interpolate
 * @param {number} referenceYear - Base year for reference position (default 2026)
 * @returns {number} Position at target year
 */
export const calculatePositionByEPR = (
  referencePosition,
  epr,
  targetYear,
  referenceYear = 2026
) => {
  if (!epr || isNaN(epr)) {
    console.warn("Invalid EPR, returning reference position");
    return referencePosition;
  }

  const yearsDifference = targetYear - referenceYear;
  return referencePosition + (epr * yearsDifference);
};

/**
 * Generate coastline for any year using single EPR value
 * ADVANTAGES:
 * - Only need ONE slope value
 * - Fast O(1) calculation
 * - Works for any year (past/future)
 * - Uses actual historical data (extrapolated)
 */
export const generateShoreline_ByEPR = (
  referenceShoreline,        // Array of [lat, lng] coordinates
  epr,                       // m/year
  targetYear,
  referenceYear = 2026,
  offsetFunction = defaultOffsetCoastline
) => {
  // Calculate total change in position
  const yearDifference = targetYear - referenceYear;
  const totalPositionChange = epr * yearDifference;

  // Apply perpendicular offset (same method as before)
  // This maintains coastline topology/shape
  return offsetFunction(referenceShoreline, totalPositionChange);
};

/**
 * Default offset function (perpendicular offset)
 * Can be replaced with custom implementation
 */
const defaultOffsetCoastline = (coastlinePoints, offset) => {
  if (!coastlinePoints || coastlinePoints.length < 2) return [];

  return coastlinePoints.map((point, index) => {
    let normal = [0, 0];

    if (index === 0) {
      const next = coastlinePoints[1];
      normal = [next[1] - point[1], -(next[0] - point[0])];
    } else if (index === coastlinePoints.length - 1) {
      const prev = coastlinePoints[index - 1];
      normal = [point[1] - prev[1], -(point[0] - prev[0])];
    } else {
      const prev = coastlinePoints[index - 1];
      const next = coastlinePoints[index + 1];
      normal = [(next[1] - prev[1]) / 2, -((next[0] - prev[0]) / 2)];
    }

    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]);
    if (length === 0) return point;

    normal[0] /= length;
    normal[1] /= length;

    const offsetDegrees = offset / 111000;

    return [
      point[0] + normal[0] * offsetDegrees,
      point[1] + normal[1] * offsetDegrees,
    ];
  });
};

/**
 * Advanced: EPR with trend (acceleration)
 * Position(t) = Position₀ + EPR×Δt + 0.5×trend×Δt²
 */
export const generateShoreline_EPRWithTrend = (
  referenceShoreline,
  epr,
  trend = 0,              // m/year² (acceleration)
  targetYear,
  referenceYear = 2026,
  offsetFunction = defaultOffsetCoastline
) => {
  const Δt = targetYear - referenceYear;
  
  // Linear term: EPR × time
  const linearChange = epr * Δt;
  
  // Quadratic term: acceleration
  const accelerationChange = 0.5 * trend * (Δt * Δt);
  
  // Total change
  const totalChange = linearChange + accelerationChange;

  return offsetFunction(referenceShoreline, totalChange);
};

/**
 * Calculate confidence in EPR prediction
 * Based on data spread and time range
 */
export const calculateEPRConfidence = (
  dataYears,           // [2015, 2016, ..., 2026]
  erosionRateVariance  // How much rates vary year-to-year
) => {
  const timeSpan = Math.max(...dataYears) - Math.min(...dataYears);
  
  // More years = more confident
  const timeConfidence = Math.min(timeSpan / 15, 1); // ~1 for 15+ years
  
  // Less variation = more confident
  const varianceConfidence = Math.max(1 - (erosionRateVariance / 2), 0.3);
  
  return (timeConfidence * 0.7 + varianceConfidence * 0.3);
};

export default {
  calculatePositionByEPR,
  generateShoreline_ByEPR,
  generateShoreline_EPRWithTrend,
  calculateEPRConfidence
};
```

---

## Step 4: Update Frontend Components

### Update ErosionAnalysisCards.jsx

```javascript
// BEFORE (current method)
const predictionData = analysisData ? {
  projectedEPR: analysisData.erosionRate.toFixed(2),  // Just reusing erosion rate
  // ... other data
}

// AFTER (using EPR)
const predictionData = analysisData ? {
  projectedEPR: analysisData.epr?.toFixed(4) || analysisData.erosionRate?.toFixed(2),
  // Use EPR from backend, fallback to erosion rate
}
```

### Update erosionanalysis.jsx

```javascript
// Add EPR import
import { generateShoreline_ByEPR } from "../utils/eprUtils";

export default function ErosionAnalysis() {
  // ... existing state ...
  const [municipalityEPR, setMunicipalityEPR] = useState(null);

  // Fetch EPR when municipality selected
  useEffect(() => {
    if (!selectedMunicipality) {
      setMunicipalityEPR(null);
      return;
    }

    const fetchEPR = async () => {
      try {
        const response = await fetch(
          `http://localhost:5000/api/shoreline/municipality/${encodeURIComponent(selectedMunicipality)}/epr`
        );
        if (response.ok) {
          const data = await response.json();
          setMunicipalityEPR(data.epr);
          console.log(`✓ EPR for ${selectedMunicipality}: ${data.epr} m/year`);
        }
      } catch (error) {
        console.warn("Error fetching EPR:", error);
      }
    };

    fetchEPR();
  }, [selectedMunicipality]);

  // Update comparison handler to use EPR
  const handleCompare = (pastYear, selectedYear) => {
    if (!yearlyShorelineData || yearlyShorelineData.length === 0) {
      console.warn("No shoreline data available");
      return;
    }

    const currentShoreline = yearlyShorelineData[yearlyShorelineData.length - 1].shoreline;
    const currentYear = 2026;
    const epr = municipalityEPR || municipalityStats?.averageErosionRate || 0;

    // Generate using EPR (SIMPLER!)
    const pastShoreline = generateShoreline_ByEPR(currentShoreline, epr, pastYear, currentYear);
    const comparisonShoreline = generateShoreline_ByEPR(currentShoreline, epr, selectedYear, currentYear);

    setComparedYear(pastYear);
    setComparedShoreline(pastShoreline);
    setSelectedYearComparison(selectedYear);
    setSelectedYearShoreline(comparisonShoreline);

    console.log(`✓ Generated comparison using EPR: ${epr} m/year`);
  };

  // Update prediction to use EPR
  const handlePredictSimulate = (baseYear, predictionYear) => {
    if (!yearlyShorelineData || yearlyShorelineData.length === 0) {
      console.warn("No shoreline data available");
      return;
    }

    const currentShoreline = yearlyShorelineData[yearlyShorelineData.length - 1].shoreline;
    const currentYear = 2026;
    const epr = municipalityEPR || municipalityStats?.averageErosionRate || 0;

    // Generate prediction using EPR (MUCH SIMPLER!)
    const predictedCoastline = generateShoreline_ByEPR(
      currentShoreline,
      epr,
      predictionYear,
      currentYear
    );

    setPredictedYear(predictionYear);
    setPredictedShoreline(predictedCoastline);

    console.log(`✓ Predicted ${predictionYear} using EPR: ${epr} m/year`);
  };

  // ... rest of component
}
```

---

## Step 5: Migration Command

### One-Time EPR Calculation for All Municipalities

```javascript
// backend/routes/shorelineData.js

router.post("/calculate-all-epr", async (req, res) => {
  try {
    const { startYear = 2015, endYear = 2026 } = req.body;

    // Get list of all municipalities with data
    const municipalitiesResult = await pool.query(
      `SELECT DISTINCT municipality FROM shoreline_zones ORDER BY municipality`
    );

    const results = [];
    const errors = [];

    // Calculate EPR for each municipality
    for (const { municipality } of municipalitiesResult.rows) {
      try {
        const dataResult = await pool.query(
          `SELECT 
            CAST(year AS INTEGER) as year, 
            AVG(CAST(cumulative_erosion AS FLOAT)) as avg_erosion,
            COUNT(DISTINCT CAST(year AS INTEGER)) as year_count
          FROM shoreline_zones
          WHERE LOWER(municipality) = LOWER($1)
            AND CAST(year AS INTEGER) >= $2
            AND CAST(year AS INTEGER) <= $3
          GROUP BY CAST(year AS INTEGER)
          ORDER BY year ASC`,
          [municipality, parseInt(startYear), parseInt(endYear)]
        );

        if (dataResult.rows.length < 2) continue;

        const startData = dataResult.rows[0];
        const endData = dataResult.rows[dataResult.rows.length - 1];
        const epr = (parseFloat(endData.avg_erosion) - parseFloat(startData.avg_erosion)) / (parseInt(endData.year) - parseInt(startData.year));
        const yearCount = dataResult.rows.length;

        await pool.query(
          `INSERT INTO municipality_epr (municipality, epr_rate, base_year, calculation_method, data_points_used, calculated_at)
           VALUES ($1, $2::DECIMAL, $3::INTEGER, 'Linear', $4::INTEGER, NOW())
           ON CONFLICT (municipality) DO UPDATE SET epr_rate = $2::DECIMAL, updated_at = NOW()`,
          [municipality, parseFloat(epr.toFixed(4)), parseInt(endYear), yearCount]
        );

        results.push({ municipality, epr: parseFloat(epr.toFixed(4)), status: "✓" });
      } catch (err) {
        errors.push({ municipality, error: err.message });
      }
    }

    res.json({
      message: "EPR calculation complete",
      calculated: results.length,
      errors: errors.length,
      results,
      errors
    });
  } catch (err) {
    console.error("Error in batch EPR calculation:", err);
    res.status(500).json({ error: "Batch calculation failed" });
  }
});
```

---

## Step 6: Performance Impact

### Before (Current Method)
```javascript
// For each comparison/prediction:
generateMunicipalityErosionRate()        // Seeded RNG lookup
→ getMunicipalityRandom()                 // Hash calculation
→ Complex logic for each year             // O(years) complexity
→ offsetCoastline()                       // O(points) complexity

Total: O(years × points) per operation
Cached: ✗ No (recalculated each time)
```

### After (EPR Method)
```javascript
// For each comparison/prediction:
fetch EPR from database                  // Single query
→ generateShoreline_ByEPR()               // One formula
→ offsetCoastline()                       // O(points) complexity

Total: O(points) per operation
Cached: ✓ Yes (EPR stored in DB)
Improvement: 10-100x faster
```

---

## Step 7: Testing

### Test EPR Calculations

```javascript
// frontend/src/utils/__tests__/eprUtils.test.js

import { generateShoreline_ByEPR, calculatePositionByEPR } from "../eprUtils";

describe("EPR Utilities", () => {
  test("EPR linear interpolation", () => {
    // If position is 100 in 2026, and EPR is -1.2 m/year
    // Then position in 2020 should be 107.2
    const result = calculatePositionByEPR(100, -1.2, 2020, 2026);
    expect(result).toBe(107.2);
  });

  test("EPR future prediction", () => {
    // Position in 2030 should be 95.2
    const result = calculatePositionByEPR(100, -1.2, 2030, 2026);
    expect(result).toBe(95.2);
  });

  test("Shoreline generation maintains point count", () => {
    const shore = [[14.657, 120.500], [14.658, 120.501], [14.659, 120.502]];
    const result = generateShoreline_ByEPR(shore, -1.2, 2030, 2026);
    expect(result.length).toBe(shore.length);
  });
});
```

---

## Rollout Plan

### Phase 1: Setup (Day 1)
- ✅ Create `municipality_epr` table
- ✅ Add EPR backend routes
- ✅ Deploy backend changes

### Phase 2: Calculation (Day 1-2)
- ✅ Run `POST /calculate-all-epr`
- ✅ Verify EPR values against expected ranges (0.5-3.0 m/year)
- ✅ Store in database

### Phase 3: Frontend (Day 2-3)
- ✅ Add `eprUtils.js`
- ✅ Update components to use EPR
- ✅ Test all comparison/prediction features
- ✅ Deploy frontend changes

### Phase 4: Verification (Day 3)
- ✅ Compare results between old and new method
- ✅ Check performance improvement
- ✅ User acceptance testing

---

## Expected Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Code Lines (math section)** | 300+ | ~50 | -83% |
| **Calculation Time** | 50-100ms | 5-10ms | 10x faster |
| **Memory Usage** | Medium | Low | Reduced |
| **Database Calls** | Per operation | Cached | Reduced |
|Maintainability** | 🔴 Low | 🟢 High | ↑ |
| **Accuracy** | 🟡 Simulated | 🟢 Real | ↑ |

---

## Rollback Plan (if needed)

```javascript
// Keep old methods available during transition
const useLegacyMethod = () => {
  // Set environment variable
  process.env.USE_LEGACY_SIMULATION = true;
};

// In generateShoreline function:
if (process.env.USE_LEGACY_SIMULATION) {
  return oldGenerateComparisonShorelineForYear(...);
} else {
  return newGenerateShoreline_ByEPR(...);
}
```
