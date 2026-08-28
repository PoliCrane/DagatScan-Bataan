# EPR Implementation - Error Fixes

## Error You Encountered
```
ERROR:  column "id" is of type integer but expression is of type character varying
HINT:  You will need to rewrite or cast the expression.
```

---

## Root Causes Fixed ✓

### 1. **Type Mismatch in Direct Arithmetic** ✗ → ✓
```javascript
// BEFORE (Error): String subtraction
const yearsElapsed = endDate.year - startData.year;
//                  ^^^^^^^^ (was string, causing type issues)

// AFTER (Fixed): Explicit type conversion
const yearsElapsed = parseInt(endData.year) - parseInt(startData.year);
```

### 2. **Missing Type Casting in SQL Queries** ✗ → ✓
```sql
-- BEFORE (Error): No type casting
SELECT year, cumulative_erosion
FROM shoreline_zones
WHERE year IN ($2, $3)
-- year and cumulative_erosion are stored as VARCHAR, causing confusion

-- AFTER (Fixed): Explicit casting
SELECT 
  CAST(year AS INTEGER) as year, 
  CAST(cumulative_erosion AS FLOAT) as cumulative_erosion
FROM shoreline_zones
WHERE CAST(year AS INTEGER) IN ($2, $3)
```

### 3. **Missing Type Casting in INSERT** ✗ → ✓
```sql
-- BEFORE (Error): No explicit casting
INSERT INTO municipality_epr 
(municipality, epr_rate, base_year, calculation_method, data_points_used)
VALUES ($1, $2, $3, 'Linear', $4)
-- PostgreSQL tries to infer types and fails when year/epr are strings

-- AFTER (Fixed): Explicit casting with ::TYPE
INSERT INTO municipality_epr 
(municipality, epr_rate, base_year, calculation_method, data_points_used, calculated_at)
VALUES ($1, $2::DECIMAL, $3::INTEGER, 'Linear', $4::INTEGER, NOW())
```

### 4. **Typo: `endDate` vs `endData`** ✗ → ✓
```javascript
// BEFORE: Typo in variable name
const yearsElapsed = endDate.year - startData.year;
                      ^^^^^^^ (undefined variable!)

// AFTER: Correct variable name
const yearsElapsed = endData.year - startData.year;
```

### 5. **Node.js Parameter Type Mismatch** ✗ → ✓
```javascript
// BEFORE (Error): Passing string years and untyped numbers
[municipality, epr, endYear, result.rows.length]
//             ^^^  ^^^^^^^  ^^^^^^^^^^^^^^^^ (all could be strings from URL params)

// AFTER (Fixed): Explicit type conversion
[municipality, parseFloat(epr.toFixed(4)), parseInt(endYear), result.rows.length]
```

---

## Summary of Changes

| Issue | Problem | Solution |
|-------|---------|----------|
| `endDate.year` | Typo - undefined variable | Use `endData.year` |
| `year - year` | String subtraction | Use `parseInt(year)` |
| `cumulative_erosion - cumulative_erosion` | String subtraction | Use `parseFloat()` |
| SQL SELECT without CAST | VARCHAR fields treated as strings | Add `CAST(... AS TYPE)` |
| INSERT without ::TYPE | Implicit casting fails | Use `$2::DECIMAL`, `$3::INTEGER` |
| URL params (integers) | Parameters come as strings | Use `parseInt()`, `parseFloat()` |

---

## Updated Queries - Copy Paste Ready

### Query 1: First/Last Year Data
```javascript
const result = await pool.query(
  `SELECT 
    CAST(year AS INTEGER) as year, 
    CAST(cumulative_erosion AS FLOAT) as cumulative_erosion,
    AVG(CAST(erosion_rate AS FLOAT)) as avg_rate
  FROM shoreline_zones
  WHERE LOWER(municipality) = LOWER($1) 
    AND CAST(year AS INTEGER) IN ($2, $3)
  GROUP BY CAST(year AS INTEGER), CAST(cumulative_erosion AS FLOAT)
  ORDER BY year`,
  [municipality, parseInt(startYear), parseInt(endYear)]
);

const startData = result.rows[0];
const endData = result.rows[result.rows.length - 1];
const totalChange = parseFloat(endData.cumulative_erosion) - parseFloat(startData.cumulative_erosion);
const yearsElapsed = parseInt(endData.year) - parseInt(startData.year);
```

### Query 2: Insert with Type Casting
```javascript
const epr = totalChange / yearsElapsed;
await pool.query(
  `INSERT INTO municipality_epr 
   (municipality, epr_rate, base_year, calculation_method, data_points_used, calculated_at)
   VALUES ($1, $2::DECIMAL, $3::INTEGER, 'Linear', $4::INTEGER, NOW())
   ON CONFLICT (municipality) 
   DO UPDATE SET epr_rate = $2::DECIMAL, updated_at = NOW(), calculated_at = NOW()`,
  [municipality, parseFloat(epr.toFixed(4)), parseInt(endYear), result.rows.length]
);
```

### Query 3: Batch EPR Calculation
```javascript
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
const epr = (parseFloat(endData.avg_erosion) - parseFloat(startData.avg_erosion)) 
          / (parseInt(endData.year) - parseInt(startData.year));
const yearCount = dataResult.rows.length;

await pool.query(
  `INSERT INTO municipality_epr (municipality, epr_rate, base_year, calculation_method, data_points_used, calculated_at)
   VALUES ($1, $2::DECIMAL, $3::INTEGER, 'Linear', $4::INTEGER, NOW())
   ON CONFLICT (municipality) DO UPDATE SET epr_rate = $2::DECIMAL, updated_at = NOW()`,
  [municipality, parseFloat(epr.toFixed(4)), parseInt(endYear), yearCount]
);
```

---

## Testing the Fix

After applying these fixes, test with:

```bash
# 1. Create the table
CREATE TABLE municipality_epr (
  id SERIAL PRIMARY KEY,
  municipality VARCHAR(100) UNIQUE NOT NULL,
  epr_rate DECIMAL(10,4) NOT NULL,
  confidence DECIMAL(3,2),
  base_year INTEGER,
  calculation_method VARCHAR(50),
  data_points_used INTEGER,
  calculated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

# 2. Test the calculation endpoint
curl -X POST http://localhost:5000/api/shoreline/municipality/Bataan/calculate-epr \
  -H "Content-Type: application/json" \
  -d '{"startYear": 2015, "endYear": 2026}'

# Expected response:
{
  "municipality": "Bataan",
  "epr": 1.2,
  "yearRange": { "start": 2015, "end": 2026 },
  "totalErosion": 13.2,
  "yearsElapsed": 11,
  "message": "EPR calculated successfully"
}

# 3. Test batch calculation
curl -X POST http://localhost:5000/api/calculate-all-epr \
  -H "Content-Type: application/json" \
  -d '{"startYear": 2015, "endYear": 2026}'
```

---

## Prevention Checklist

- ✅ Always `CAST()` VARCHAR columns in SQL when doing arithmetic
- ✅ Always `parseInt()` or `parseFloat()` before arithmetic in JavaScript
- ✅ Use `::TYPE` syntax in PostgreSQL INSERT for type safety
- ✅ Include `parseInt()` when receiving URL/query params as years
- ✅ Test with real database data, not just dev data
- ✅ Check for typos in variable names (endDate vs endData)
- ✅ Use VS Code's Find/Replace to catch common patterns

---

## Files Updated

✅ EPR_IMPLEMENTATION_GUIDE.md - All code examples fixed
✅ PostgreSQL type casting applied to all queries
✅ Node.js parameter conversion applied

---

## Need More Help?

If you still see type errors:

1. **Check your shoreline_zones schema:**
   ```sql
   \d shoreline_zones  -- Show table structure
   ```

2. **Make sure columns are correct types:**
   ```sql
   ALTER TABLE shoreline_zones 
   ALTER COLUMN year TYPE INTEGER USING CAST(year AS INTEGER);
   
   ALTER TABLE shoreline_zones 
   ALTER COLUMN cumulative_erosion TYPE DECIMAL(10,4) 
   USING CAST(cumulative_erosion AS DECIMAL);
   ```

3. **Or cast in queries (safer):**
   ```sql
   SELECT CAST(year AS INTEGER), CAST(cumulative_erosion AS DECIMAL)
   ```

4. **Always add type checking to Node.js:**
   ```javascript
   console.log(typeof year);  // Should be 'number', not 'string'
   ```
