# Enhanced ERD Guide - Caching Layer with Foreign Keys

## Database Relationships

### Entity Relationship Diagram

```
┌─────────────────────────────────────┐
│      municipalities (Master)         │
│  ─────────────────────────────────  │
│  • id (PK)                          │
│  • name (UNIQUE)                    │
│  • region                           │
│  • province                         │
│  • created_at                       │
└──────────────┬──────────────────────┘
               │
               │ 1:M ┌─────────────────────────────────────┐
               ├─────┤     shoreline_zones (Raw Data)     │
               │     │  ─────────────────────────────────  │
               │     │  • id (PK)                          │
               │     │  • municipality_id (FK) [RESTRICT]  │
               │     │  • specific_area                    │
               │     │  • year                             │
               │     │  • erosion_rate                     │
               │     │  • cumulative_erosion               │
               │     │  • data_quality                     │
               │     │  • source_type                      │
               │     │  • geojson_data                     │
               │     │  • created_at / updated_at          │
               │     └─────────────────────────────────────┘
               │
               │ 1:M ┌─────────────────────────────────────┐
               ├─────┤ municipality_analysis_cache (Cache) │
               │     │  ─────────────────────────────────  │
               │     │  • id (PK)                          │
               │     │  • municipality_id (FK) [CASCADE]   │
               │     │  • analysis_year                    │
               │     │  • coastline_length                 │
               │     │  • affected_area                    │
               │     │  • avg_erosion_rate                 │
               │     │  • cumulative_erosion               │
               │     │  • zone_count                       │
               │     │  • risk_level                       │
               │     │  • cache_valid_until                │
               │     └─────────────────────────────────────┘
               │
               │ 1:M ┌─────────────────────────────────────┐
               ├─────┤     prediction_cache (Cache)        │
               │     │  ─────────────────────────────────  │
               │     │  • id (PK)                          │
               │     │  • municipality_id (FK) [CASCADE]   │
               │     │  • base_year                        │
               │     │  • predicted_year                   │
               │     │  • estimated_retreat                │
               │     │  • projected_epr                    │
               │     │  • risk_level                       │
               │     │  • cache_valid_until                │
               │     └─────────────────────────────────────┘
               │
               │ 1:M ┌─────────────────────────────────────┐
               ├─────┤ shoreline_comparison_cache (Cache)  │
               │     │  ─────────────────────────────────  │
               │     │  • id (PK)                          │
               │     │  • municipality_id (FK) [CASCADE]   │
               │     │  • year_start                       │
               │     │  • year_end                         │
               │     │  • erosion_change                   │
               │     │  • rate_change                      │
               │     │  • area_change                      │
               │     │  • cache_valid_until                │
               │     └─────────────────────────────────────┘
               │
               └───── 1:M ┌─────────────────────────────────────┐
                         │ cache_invalidation_log (Audit)      │
                         │  ─────────────────────────────────  │
                         │  • id (PK)                          │
                         │  • table_name                       │
                         │  • municipality_id (FK) [SET NULL]  │
                         │  • reason                           │
                         │  • invalidated_at                   │
                         └─────────────────────────────────────┘
```

## Key Relationships

### 1. **Primary: municipalities → shoreline_zones**

- **Type**: One-to-Many (1:M)
- **Foreign Key**: `shoreline_zones.municipality_id` → `municipalities.id`
- **ON DELETE**: `RESTRICT` - Prevents deleting municipality if it has raw data
- **Cardinality**: One municipality has many shoreline zones
- **Use Case**: Query all zones for a specific municipality

### 2. **Primary: municipalities → municipality_analysis_cache**

- **Type**: One-to-Many (1:M) with UNIQUE constraint
- **Foreign Key**: `municipality_analysis_cache.municipality_id` → `municipalities.id`
- **ON DELETE**: `CASCADE` - Deletes cached analysis if municipality is deleted
- **Cardinality**: One municipality has ONE analysis cache (unique constraint)
- **Use Case**: Cache analysis results per municipality

### 3. **Primary: municipalities → prediction_cache**

- **Type**: One-to-Many (1:M)
- **Foreign Key**: `prediction_cache.municipality_id` → `municipalities.id`
- **ON DELETE**: `CASCADE` - Deletes predictions if municipality is deleted
- **Cardinality**: One municipality has many predictions (different base/predicted years)
- **Use Case**: Cache multiple prediction scenarios per municipality

### 4. **Primary: municipalities → shoreline_comparison_cache**

- **Type**: One-to-Many (1:M)
- **Foreign Key**: `shoreline_comparison_cache.municipality_id` → `municipalities.id`
- **ON DELETE**: `CASCADE` - Deletes comparisons if municipality is deleted
- **Cardinality**: One municipality has many year comparisons
- **Use Case**: Cache year-over-year comparisons

### 5. **Optional: municipalities → cache_invalidation_log**

- **Type**: One-to-Many (1:M)
- **Foreign Key**: `cache_invalidation_log.municipality_id` → `municipalities.id`
- **ON DELETE**: `SET NULL` - Preserves audit trail even if municipality deleted
- **Cardinality**: One municipality has many invalidation events
- **Use Case**: Audit logging, compliance tracking

## Benefits of This Structure

### ✅ Data Integrity

- Foreign Key constraints ensure referential integrity
- Cannot have orphaned cache records
- Cannot delete municipality while it has raw data (RESTRICT)

### ✅ Query Performance

- Join on `municipality_id` (integer) is faster than string comparison
- Indexes on `municipality_id` for quick lookups
- Composite indexes for common queries

### ✅ Data Normalization

- Municipality information stored once (single source of truth)
- Reduces data redundancy
- Easier to update municipality details

### ✅ ERD Clarity

- Clear one-to-many relationships
- Visual representation of cache dependencies
- Better database documentation

## Comparison: Before vs After

### Before (String-Based)

```sql
CREATE TABLE shoreline_zones (
  municipality VARCHAR(255),  -- String reference
  ...
);
```

**Problems:**

- Typos possible ("Baatan" vs "Bataan")
- No referential integrity
- String comparisons slower
- Harder to modify municipality names

### After (FK-Based)

```sql
CREATE TABLE shoreline_zones (
  municipality_id INTEGER REFERENCES municipalities(id),  -- Integer reference
  ...
);
```

**Advantages:**

- No typos (validated via FK)
- Full referential integrity
- Integer comparisons faster
- Name changes only in one place

## Cascade Delete Strategy

| Table                         | DELETE Action | Reason                                                   |
| ----------------------------- | ------------- | -------------------------------------------------------- |
| `shoreline_zones`             | `RESTRICT`    | Preserve raw data integrity - admin must manually manage |
| `municipality_analysis_cache` | `CASCADE`     | Cache is derived - regenerate if needed                  |
| `prediction_cache`            | `CASCADE`     | Cache is derived - regenerate if needed                  |
| `shoreline_comparison_cache`  | `CASCADE`     | Cache is derived - regenerate if needed                  |
| `cache_invalidation_log`      | `SET NULL`    | Keep audit trail even after municipality deleted         |

## Example Queries with Improved Structure

### Query 1: Get all zones for a municipality

```sql
-- Before (string search - slower)
SELECT * FROM shoreline_zones
WHERE municipality = 'Bataan';

-- After (FK lookup - faster)
SELECT sz.* FROM shoreline_zones sz
WHERE sz.municipality_id = (SELECT id FROM municipalities WHERE name = 'Bataan');

-- Or with JOIN (best for reports)
SELECT m.name, sz.specific_area, sz.year, sz.erosion_rate
FROM shoreline_zones sz
JOIN municipalities m ON sz.municipality_id = m.id
WHERE m.name = 'Bataan' AND sz.year = 2023;
```

### Query 2: Check cache validity with municipality names

```sql
-- Much clearer with JOIN to municipalities
SELECT
  m.name,
  m.region,
  mac.analysis_year,
  mac.cache_valid_until,
  CASE
    WHEN mac.cache_valid_until > NOW() THEN 'VALID ✓'
    ELSE 'EXPIRED ✗'
  END as cache_status
FROM municipality_analysis_cache mac
JOIN municipalities m ON mac.municipality_id = m.id
ORDER BY m.name;
```

### Query 3: Audit invalidation events

```sql
-- Track what got invalidated and why
SELECT
  m.name,
  cil.table_name,
  cil.reason,
  cil.invalidated_at
FROM cache_invalidation_log cil
LEFT JOIN municipalities m ON cil.municipality_id = m.id
ORDER BY cil.invalidated_at DESC
LIMIT 20;
```

## Migration Path (if upgrading from old schema)

```sql
-- Step 1: Create municipalities table
CREATE TABLE municipalities (...)
INSERT INTO municipalities (name) SELECT DISTINCT municipality FROM shoreline_zones;

-- Step 2: Add municipality_id to shoreline_zones
ALTER TABLE shoreline_zones ADD COLUMN municipality_id INTEGER;

-- Step 3: Populate foreign key IDs
UPDATE shoreline_zones sz
SET municipality_id = (SELECT id FROM municipalities WHERE name = sz.municipality)
WHERE municipality_id IS NULL;

-- Step 4: Make FK NOT NULL and add constraint
ALTER TABLE shoreline_zones
ALTER COLUMN municipality_id SET NOT NULL,
ADD CONSTRAINT fk_shoreline_municipality FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE RESTRICT;

-- Step 5: Drop old municipality VARCHAR column (after verification)
ALTER TABLE shoreline_zones DROP COLUMN municipality;
```

## Conclusion

This FK-based architecture provides:

- ✅ Better referential integrity
- ✅ Cleaner ERD representation
- ✅ Improved query performance
- ✅ Single source of truth for municipalities
- ✅ Full audit trail via cache_invalidation_log
- ✅ Easier maintenance and data consistency
