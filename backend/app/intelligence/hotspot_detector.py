"""
HotspotDetector — spec section 25/51.

MVP implementation: real PostGIS spatial clustering (ST_ClusterDBSCAN) over
recorded complaints, grouping nearby reports into hotspots by density. This
is deterministic spatial aggregation — explicitly NOT ML-based prediction.
"""
from sqlalchemy import func
from sqlalchemy.orm import Session
from geoalchemy2 import Geometry
from sqlalchemy import cast

from app.models.bins_complaints import Complaint


def detect_complaint_hotspots(
    db: Session, eps_meters: float = 300, min_points: int = 3
) -> list[dict]:
    """
    Groups complaints into spatial clusters using PostGIS ST_ClusterDBSCAN.
    Returns one row per cluster with its centroid and complaint count.
    `eps_meters` / `min_points` are the DBSCAN parameters (configurable).

    The geometry column is explicitly cast to geometry(Point,4326) so
    ST_ClusterDBSCAN receives the correct type on PostgreSQL 18 / PostGIS 3.6.
    eps is converted from metres to degrees (÷111320) for SRID 4326 geometry.
    """
    # Explicit cast ensures PostGIS 3.6 resolves the correct function overload.
    # ST_ClusterDBSCAN signature: ST_ClusterDBSCAN(geom geometry, eps float, minpoints int)
    # eps is converted from metres to degrees (÷111320) for SRID 4326 geometry.
    # Pass eps and minpoints as positional SQL literals, not Python kwargs,
    # so SQLAlchemy renders them inline in the SQL rather than as bind params.
    from sqlalchemy import literal
    location_geom = cast(Complaint.location, Geometry(geometry_type="POINT", srid=4326))

    cluster_id = func.ST_ClusterDBSCAN(
        location_geom,
        literal(eps_meters / 111320.0),
        literal(min_points),
    ).over()

    subq = db.query(
        Complaint.id,
        Complaint.location,
        cluster_id.label("cluster_id"),
    ).subquery()

    results = (
        db.query(
            subq.c.cluster_id,
            func.count(subq.c.id).label("complaint_count"),
            func.ST_AsGeoJSON(func.ST_Centroid(func.ST_Collect(subq.c.location))).label("centroid"),
        )
        .filter(subq.c.cluster_id.isnot(None))
        .group_by(subq.c.cluster_id)
        .order_by(func.count(subq.c.id).desc())
        .all()
    )

    import json

    hotspots = []
    for cluster_id_val, count, centroid_geojson in results:
        centroid = json.loads(centroid_geojson)
        lng, lat = centroid["coordinates"]
        hotspots.append({"cluster_id": cluster_id_val, "complaint_count": count, "latitude": lat, "longitude": lng})
    return hotspots
