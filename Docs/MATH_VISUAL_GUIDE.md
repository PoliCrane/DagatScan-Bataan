# Mathematical Approximations - Visual Guide

## 1. CURRENT SHORELINE (2026)

```
Database: shoreline_zones table
┌─────────────────────────────────────────┐
│ Municipality: Bataan, Year: 2024        │
│ erosion_rate: 1.2 m/year               │
│ cumulative_erosion: 13.2 m             │
│ geojson_data: [[14.657, 120.500], ...] │
└─────────────────────────────────────────┘

Frontend Display:
    2024 Shoreline ────────────────── 13.2m inland from reference
    2026 Shoreline ───────── (extrapolated +2.4m more erosion)
    
Formula: 
  S₂₀₂₆ = S₂₀₂₄ + (1.2 m/year × 2 years)
  S₂₀₂₆ = S₂₀₂₄ + 2.4m
```

---

## 2. PAST SHORELINE (2015)

### Mathematical Steps:

```
Step 1: Get current shoreline (2026)
  S_current = [[14.657, 120.500], [14.658, 120.501], ...]

Step 2: Calculate base erosion rate from center coordinates
  centerLat = SUM(lat) / count = 14.657
  centerLng = SUM(lng) / count = 120.500
  
  Using seeded hash: hash = FNV(lat*100000:lng*100000)
  R_base = hash % some_range = 1.2 m/year

Step 3: Calculate total erosion from 2015 to 2026 (11 years)
  For each year t from 2015 to 2026:
    ├─ 2015: R_t = 1.2 + sin(seed_2015) × 0.3 = ~1.05 m
    ├─ 2016: R_t = 1.2 + sin(seed_2016) × 0.3 = ~1.35 m
    ├─ 2017: R_t = 1.2 + sin(seed_2017) × 0.3 = ~1.15 m
    ├─ ...
    └─ 2025: R_t = 1.2 + sin(seed_2025) × 0.3 = ~1.08 m
  
  Total Erosion (2015-2026) = 1.05+1.35+1.15+...+1.08 = 13.2m

Step 4: Reverse the erosion to get 2015 shoreline
  reverseOffset = -13.2 m (move seaward)
  S_2015 = offsetCoastline(S_2026, reverseOffset)

Step 5: Apply perpendicular offset to each point
  For point P = [lat, lng]:
    a) Calculate perpendicular normal N
    b) Normalize N to unit length: |N| = 1
    c) Apply offset: P_new = P + N × (13.2m / 111km)
    
    13.2 / 111,000 = 0.000119 degrees
    
    P_2015 ≈ [14.656881, 120.500119]
                  ↑              ↑
              moved ±0.000119° in perpendicular direction
```

### Visual Representation:

```
2026 Shoreline (Current):
━━━━━━━━━━━━━━━ ◆ ◆ ◆ ◆ ◆ ◆ ◆ ━━━━━━━━━━━━━━━
                 ▲ ▲ ▲ ▲ ▲ ▲ ▲
                 │ │ │ │ │ │ │ (normals, perpendicular to coast)
                 │ │ │ │ │ │ │
                 13.2 m
                 ↓ ↓ ↓ ↓ ↓ ↓ ↓
2015 Shoreline (Generated):
━━━━━━━━━━━━━━━ ◇ ◇ ◇ ◇ ◇ ◇ ◇ ━━━━━━━━━━━━━━━
                (seaward, before erosion)
```

### Algorithm Code Walkthrough:

```javascript
// Simplified walkthrough
const offsetCoastline = (points, offset) => {
  return points.map((point, i) => {
    
    // 1️⃣ Calculate perpendicular normal
    let normal = calculateNormal(points, i);
    //    normal = [dx, dy] perpendicular to coastline
    
    // 2️⃣ Normalize to unit length
    const len = Math.sqrt(normal[0]² + normal[1]²);
    normal = [normal[0]/len, normal[1]/len];
    //    |normal| = 1
    
    // 3️⃣ Convert meters to degrees
    const offsetDeg = offset / 111000;  // 111km per degree
    //    13.2m → 0.000119°
    
    // 4️⃣ Apply perpendicular shift
    return [
      point[0] + normal[0] * offsetDeg,  // lat shift
      point[1] + normal[1] * offsetDeg   // lng shift
    ];
  });
};

// Example with real numbers:
// Point: [14.657000, 120.500000]
// Normal: [0.707, 0.707] (45° angle, normalized)
// Offset: 13.2m → 0.000119°
// Result: [14.657084, 120.500084]
//             ↑             ↑
//        moved 0.000084°  moved 0.000084°
```

---

## 3. FUTURE SHORELINE (2030)

### Mathematical Steps:

```
Step 1: Get current 2026 shoreline
  S_current = fetched from database

Step 2: Calculate erosion rate (from municipality stats)
  R = averageErosionRate = 1.2 m/year

Step 3: Calculate years into future
  Δt = 2030 - 2026 = 4 years

Step 4: Project erosion linearly
  Δx = R × Δt = 1.2 × 4 = 4.8 m
  
  ASSUMPTION: Erosion continues at same rate
  ⚠️  No acceleration, no changes in conditions

Step 5: Apply perpendicular offset (same as past method)
  S_2030 = offsetCoastline(S_current, 4.8)
```

### Visual Representation:

```
Timeline:
2024 ────── 2026 ─────────── 2030
(+2.4m)    (current) +4.8m   (future)
  │           │   ← 4 years →
  │           │
Base:  ─────▓─────────────────────
2024: ────▓▓────────────────────
Current:  ───▓                    (1.2 × 2 = 2.4m additional)
2030 pred: ─────────────▓         (1.2 × 4 = 4.8m from now)
```

### Assumption: LINEAR TREND

```
Erosion Rate: R = 1.2 m/year (constant)

Position(t) = Position(2026) - R × (t - 2026)

Position(2030) = Position(2026) - 1.2 × 4
               = Position(2026) - 4.8

This assumes:
✓ Same erosion rate continues
✓ No seasonal variation
✓ No intervention/construction
✓ No climate change impacts
```

---

## EPR (End Point Rate) Method Comparison

### What EPR Means:

```
EPR = (X_final - X_initial) / (T_final - T_initial)

Data Available:
├─ 2015 Shoreline: 500m from reference point
└─ 2026 Shoreline: 486.8m from reference point (13.2m erosion)

EPR Calculation:
  EPR = (486.8 - 500) / (2026 - 2015)
      = -13.2 / 11
      = -1.2 m/year
      
      (negative = erosion/retreat)
```

### Using EPR to Generate Any Year:

```
Formula: Position(t) = Position(start) + EPR × (t - start)

Generate 2015 shoreline:
  Pos_2015 = Pos_2026 + (-1.2) × (2015 - 2026)
           = Pos_2026 + (-1.2) × (-11)
           = Pos_2026 + 13.2m ✓ (seaward)

Generate 2020 shoreline:
  Pos_2020 = Pos_2026 + (-1.2) × (2020 - 2026)
           = Pos_2026 + (-1.2) × (-6)
           = Pos_2026 + 7.2m

Generate 2030 (prediction):
  Pos_2030 = Pos_2026 + (-1.2) × (2030 - 2026)
           = Pos_2026 + (-1.2) × 4
           = Pos_2026 - 4.8m ✓ (inland)

Timeline Visualization:
2015: ──────────●── (100% seaward)
      
2020: ────────●─ (65% eroded)
      
2026: ───────● (current = reference)
      
2030: ──●─ (35% more erosion)
      
Erosion Amount:
├─ 2015→2026: 13.2m
├─ 2026→2030: 4.8m
└─ Total 2015→2030: 18m
```

---

## Code Comparison: Current vs EPR

### Current Method
```javascript
// Pros: ✓ Detailed temporal variation
//       ✓ Year-by-year data available
// Cons: ✗ Complex simulation
//       ✗ Data-dependent (needs all years)

const generatePastShoreline = (currentShoreline, targetYear) => {
  // Calculate base rate (from coordinates)
  const baseRate = generateMunicipalityErosionRate(centerLat, centerLng);
  
  // Calculate each year's erosion
  const totalErosion = 0;
  for (let year = targetYear; year < 2026; year++) {
    const yearRate = generateYearVariation(baseRate, year, lat, lng);
    totalErosion += yearRate;
  }
  
  // Apply offset
  return offsetCoastline(currentShoreline, -totalErosion);
};
```

### EPR Method (Simpler)
```javascript
// Pros: ✓ Simple calculation
//       ✓ Fast execution
//       ✓ Industry standard
// Cons: ✗ Linear only
//       ✗ Ignores variation

const generateShorelinem_EPR = (currentShoreline, targetYear, epr) => {
  // Simple calculation
  const yearsFromNow = targetYear - 2026;
  const erosionAmount = epr * yearsFromNow;
  
  // Apply same offset
  return offsetCoastline(currentShoreline, erosionAmount);
};

// Usage:
const shoreline_2015 = generateShoreline_EPR(current, 2015, 1.2);
//                                                ←───→  ←─→
//                                              year   rate
```

---

## Precision Comparison

### Meter to Degree Conversion

```
1 degree latitude = 111 km = 111,000 meters

Small values:
    1 meter   = 1 / 111,000 = 0.000009° (9.0E-6)
   10 meters  = 10 / 111,000 = 0.00009° (9.0E-5)
   13.2 m     = 13.2 / 111,000 = 0.000119° (1.19E-4)
  100 meters  = 100 / 111,000 = 0.0009° (0.0009)
    1 km      = 1,000 / 111,000 = 0.009° (0.009)

Visual precision at zoom level:
    Leaflet zoom 14: ~26.6 meters per pixel
    13.2m offset   = ~0.5 pixels
    
        Visible? ✓ Yes, but small
```

---

## Summary: Math Behind the Scenes

| Stage | Math Method | Data Source | Result |
|-------|---|---|---|
| **Past (2015)** | Reverse cumulative erosion | Seeded RNG simulation | Simulated ⚠️ |
| **Current (2026)** | Direct from coords | Database `shoreline_zones` | Real ✓ |
| **Future (2030)** | Linear× years = extrapolation | Average rate × time | Predicted ❓ |

**Recommendation:** Use EPR for cleaner, more maintainable code
