# Shoreline Mathematical Approximations & EPR Analysis

## Current Implementation

### 1. **Current Shoreline (2026)**
**Source:** From database `shoreline_zones` table  
**Method:** Direct retrieval of uploaded data

```
Current Shoreline = Uploaded 2024 data + 2 years erosion
                  = Base Coastline - (Cumulative Erosion)
```

---

## 2. **Past Shoreline Generation** (e.g., 2015 from 2026)

### Mathematical Method: **Reverse Cumulative Erosion**

```javascript
// From fakeDataset.js: generateComparisonShorelineForYear()

1. Get current shoreline (2026): S_current
2. Calculate base erosion rate: R_base (m/year)
3. For each year t from targetYear to currentYear:
   - Annual erosion: E_t = R_base + sin(seed) * 0.3  // ±0.3 m/year variation
   - Total past erosion (2015-2026): ΣE = sum of all annual erosions
4. Reverse the offset: reverseOffset = -ΣE
5. Apply to current coastline: S_past = offsetCoastline(S_current, reverseOffset)
```

**Approximation Used: PARALLEL OFFSET** (Perpendicular Line Method)

```
For each point P_i on coastline:
a. Calculate perpendicular normal vector N
   - For endpoints: use direction to/from adjacent point
   - For middle points: average of surrounding directions
   
b. Normalize N to unit length

c. Convert offset from meters to degrees:
   offsetDegrees = offset_meters / 111,000 km
   (1 degree latitude ≈ 111 km)

d. Apply perpendicular shift:
   P_i_new = P_i + N * offsetDegrees
   
Result: Entire shoreline moves perpendicular by constant offset
```

**Advantages:**
- Simple, computationally fast
- Maintains coastline shape/topology
- Works for all points uniformly

**Limitations:**
- Assumes uniform erosion across entire coast (not realistic)
- Doesn't account for localized erosion patterns
- Perpendicular offset may cross coastline geometry (topology issues)

---

## 3. **Future Shoreline Prediction** (e.g., 2030)

### Mathematical Method: **Linear Extrapolation**

```javascript
// From erosionanalysis.jsx: handlePredictSimulate()

1. Get current shoreline (2026): S_current
2. Get erosion rate: R = averageErosionRate (m/year)
3. Calculate years into future: Δt = predictionYear - currentYear
4. Project erosion: Δx = R × Δt
5. Example: 2030 prediction = 1.2 m/year × 4 years = 4.8 m
6. Apply same offset method: S_future = offsetCoastline(S_current, Δx)
```

**Formula:**
```
S(t_future) = S(t_current) - (R × Δt)
           = S(2026) - (1.2 × 4) for 2030
           = S(2026) - 4.8 meters
```

**Assumptions:**
- Erosion rate remains constant ✓ (simplest approach)
- Erosion is linear/uniform ✓
- No environmental changes/interventions

---

## Current Offset Algorithm Analysis

### Perpendicular Offset Implementation

```javascript
const offsetCoastline = (coastlinePoints, offset) => {
  return coastlinePoints.map((point, index) => {
    // Step 1: Calculate perpendicular normal
    let normal = [0, 0];
    
    if (index === 0) {
      // First point: direction to next
      const next = coastlinePoints[1];
      normal = [next[1] - point[1], -(next[0] - point[0])];
    } else if (index === coastlinePoints.length - 1) {
      // Last point: direction from previous
      const prev = coastlinePoints[index - 1];
      normal = [point[1] - prev[1], -(point[0] - prev[0])];
    } else {
      // Middle points: average neighboring directions (2-sided normal)
      const prev = coastlinePoints[index - 1];
      const next = coastlinePoints[index + 1];
      normal = [(next[1] - prev[1]) / 2, -((next[0] - prev[0]) / 2)];
    }
    
    // Step 2: Normalize to unit vector
    const length = Math.sqrt(normal[0]² + normal[1]²);
    normal[0] /= length;
    normal[1] /= length;
    
    // Step 3: Convert meters to degrees
    const offsetDegrees = offset / 111000;
    
    // Step 4: Apply perpendicular shift
    return [
      point[0] + normal[0] * offsetDegrees,
      point[1] + normal[1] * offsetDegrees
    ];
  });
};
```

### Visual Example:
```
Coastline Point:  P -------- P -------- P
                  |          |          |
Perpendicular: ←  N →    ←  N →    ←  N →
(Normal vectors)

With offset=2m:   P' ------- P' ------- P'
(2m inland)       |          |          |
```

---

## Alternative: EPR (End Point Rate)

### What is EPR?

**End Point Rate** = Change in coastal position / Time interval

```
EPR = (Position_final - Position_initial) / (Year_final - Year_initial)
    = Δx / Δt
```

**Advantages:**
1. **Simple to calculate** - just two endpoints
2. **Based on actual measurements** - no modeling needed
3. **Used in coastal geomorphology** - industry standard
4. **Less computation** - O(1) instead of modeling each point

**Disadvantages:**
1. **Ignores temporal variation** - doesn't show year-by-year progression
2. **Assumes linear trends** - may miss acceleration/deceleration
3. **Sensitive to data quality** - relies on accurate start/end points
4. **No intermediate states** - can't show past years without calculation

### EPR-Based Shoreline Generation

```javascript
// Simpler approach using EPR
const generateShoreline_EPR = (shoreline_2015, shoreline_2026, targetYear) => {
  const EPR = (shoreline_2026 - shoreline_2015) / (2026 - 2015);  // 11 years
  const yearsFromStart = targetYear - 2015;
  const projectedChange = EPR * yearsFromStart;
  
  return shoreline_2015 + projectedChange;
};

// Example:
// Shoreline 2015: 100 m from reference
// Shoreline 2026: 88.8 m from reference (11.2 m erosion in 11 years)
// EPR = 11.2 / 11 = 1.02 m/year
// Shoreline 2020 = 100 - (1.02 × 5) = 94.9 m ✓
// Shoreline 2030 = 100 - (1.02 × 15) = 84.7 m (prediction)
```

---

## Comparison Matrix

| Metric | Current Method | EPR Method |
|--------|---|---|
| **Calculation Complexity** | 🟡 Medium | 🟢 Very Simple |
| **Computational Cost** | 🟡 ~O(n) per point | 🟢 O(1) |
| **Visual Accuracy** | 🟢 High | 🟡 Medium |
| **Data Requirements** | 🟡 Annual data | 🟢 Min 2 endpoints |
| **Temporal Detail** | 🟢 Year-by-year | 🟡 Linear only |
| **Variation Modeling** | 🟢 Yes (±0.3m annually) | 🟠 No |
| **Industry Standard** | 🟠 Custom | 🟢 Yes (coastal science) |
| **Database Integration** | 🟡 Needed annually | 🟢 2 rows needed |

---

## Recommendation: Hybrid EPR + Offset Approach

### Best of Both Worlds:

```javascript
export const generateShoreline_HybridEPR = (
  shoreline_reference_year,
  targetYear,
  referenceYear,
  epr // End Point Rate (m/year)
) => {
  // 1. Calculate linear change using EPR
  const yearsDifference = targetYear - referenceYear;
  const totalChange = epr * yearsDifference;
  
  // 2. Apply perpendicular offset
  return offsetCoastline(shoreline_reference_year, totalChange);
};

// Database friendly: Store only EPR value!
// SELECT municipality, epr FROM municipalities;
// Then generate any year on-the-fly
```

### Workflow:

1. **Upload Phase**: Calculate EPR from uploaded historical data
   ```sql
   INSERT INTO municipalities (name, epr) 
   VALUES ('Bataan', 1.2);  -- 1.2 m/year
   ```

2. **Query Phase**: Generate shorelines efficiently
   ```
   GET /api/shoreline/Bataan/year/2030?epr=1.2
   → Returns 2030 prediction instantly
   ```

3. **Storage**: Only store EPR + base year shoreline
   ```
   shoreline_zones:
   - municipality (Bataan)
   - year (2015) 
   - epr (1.2 m/year)
   - geojson_data (shoreline polyline)
   - created_at
   ```

---

## Implementation Path (Easiest to Complex)

### ✅ **Level 1: Quick Fix - Use EPR from Database**
```javascript
// In backend: Calculate EPR once from uploaded data
const calculateEPR = (data_2015, data_2026) => {
  return (data_2026.erosion - data_2015.erosion) / 11;
};

// Store in database
UPDATE municipalities SET epr = 1.2 WHERE name = 'Bataan';

// Frontend: Use EPR for predictions
projectedErosion = epr * (targetYear - currentYear);
```

### ⚠️ **Level 2: Medium - EPR with Variation**
```javascript
// Store EPR + trend
const data = {
  epr: 1.2,           // m/year
  trend: 0.05,        // acceleration (m/year²)
  acceleration: false // or calculated
};

// Prediction with trend
projectedErosion = epr * Δt + 0.5 * trend * Δt²;
```

### 🔴 **Level 3: Complex - Full Temporal Model**
```javascript
// Current implementation - keep it
// But cache results to database for performance
```

---

## Current Code Issues & Fixes

### Issue #1: No actual historical shoreline data
**Current:** Simulating past shorelines using fake erosion rates  
**Fix:** Store actual 2015-2024 shorelines in database

### Issue #2: Unpredictable simulation
**Current:** Seeded RNG generates consistent but fake shorelines  
**Fix:** Use uploaded real data with EPR calculation

### Issue #3: No variation in predictions
**Current:** Linear prediction based on average rate  
**Fix:** Add historical volatility/trend to model

---

## Database Schema for EPR

```sql
-- Add EPR calculation to shoreline_zones
ALTER TABLE shoreline_zones ADD COLUMN epr_rate FLOAT;
ALTER TABLE shoreline_zones ADD COLUMN data_type VARCHAR (50); 
-- 'Historical', 'Current', 'Predicted'

-- Or create separate table for cleaner design
CREATE TABLE municipality_erosion_rates (
  municipality VARCHAR(100),
  epr_rate FLOAT,              -- m/year
  confidence FLOAT,             -- 0-1, based on data quality
  base_year INTEGER,
  reference_year INTEGER,
  calculated_at TIMESTAMP,
  PRIMARY KEY (municipality)
);
```

---

## Conclusion

| Scenario | Recommendation |
|----------|---|
| **Showing historical accuracy** | Use EPR + stored historical shorelines |
| **Fast predictions** | Use EPR linear extrapolation |
| **Complex visualizations** | Use current parallel offset method |
| **Database efficiency** | Store EPR, generate shorelines on-demand |
| **Easy to understand** | Use EPR (industry standard) |
| **Production system** | Hybrid: EPR + perpendicular offset |

**Current Math:** Sophisticated but data-dependent  
**EPR Approach:** Simple, proven, industry-standard  
**Recommendation:** Migrate to EPR for better accuracy + performance
