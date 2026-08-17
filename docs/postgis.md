# PostGIS

PostGIS is a hard requirement of this project (spec section 4) — it is used for real spatial
storage and queries, not lat/lng floats with manual distance math.

## What's implemented

### Nearby search (`GET /api/v1/bins/nearby`)
Casts geometry columns to `geography` so `ST_DWithin`/`ST_Distance` operate in meters using
great-circle distance, then orders results by actual computed distance:

```python
distance_expr = func.ST_Distance(func.cast(Bin.location, Geography), func.cast(point, Geography))
db.query(Bin, distance_expr).filter(func.ST_DWithin(..., radius_meters)).order_by("distance_meters")
```

This was verified against a real database: a bin ~70m from a search point returned
`distance_meters: 71.1` computed entirely by Postgres.

### Point-in-polygon (`GET /api/v1/zones/lookup`)
Uses `ST_Contains(CollectionZone.boundary, point)` to find which collection zone (if any) contains a
given coordinate — a real polygon containment query, not a bounding-box approximation.

### Hotspot detection (`app/intelligence/hotspot_detector.py`)
Uses `ST_ClusterDBSCAN` for density-based spatial clustering of complaints — genuine PostGIS spatial
aggregation. This is explicitly **not** machine learning; it's deterministic clustering with
configurable `eps`/`min_points` parameters.

### Zone creation
Zones are stored as real `POLYGON` geometries built from submitted ring coordinates
(`ST_GeomFromText`), not stored as a bounding box or center+radius.

## Why geography casts instead of native geography columns

Columns are stored as `geometry(POINT, 4326)` rather than `geography(POINT, 4326)` so that
non-distance spatial operations (point-in-polygon, clustering) use the faster/simpler geometry
operators, and cast to `geography` only where meter-accurate great-circle distance is actually
needed (nearby search). This is the standard PostGIS pattern for mixed workloads.

## A known integration issue we hit and fixed

GeoAlchemy2 automatically creates a GiST spatial index via a DDL event when a table with a
`Geometry(..., spatial_index=True)` column is created. Alembic's `--autogenerate` *also* detected
and generated explicit `op.create_index(..., postgresql_using='gist')` calls for the same indexes,
causing a duplicate-index error on migration. Fixed by stripping the redundant explicit
`create_index`/`drop_index` calls from the migration (GeoAlchemy2's automatic index creation is
sufficient) — see `backend/migrations/versions/*_initial_schema.py`.
