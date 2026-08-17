"""
Small helper layer around GeoAlchemy2 + Shapely so services deal in plain
lat/lng floats while the database stores real PostGIS geometry(POINT,4326).
"""
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point


def point_from_latlng(lat: float, lng: float):
    """Build a PostGIS-ready geometry from lat/lng (note: Shapely Point takes x=lng, y=lat)."""
    return from_shape(Point(lng, lat), srid=4326)


def latlng_from_point(geom) -> tuple[float, float] | None:
    if geom is None:
        return None
    shp = to_shape(geom)
    return (shp.y, shp.x)  # (lat, lng)
