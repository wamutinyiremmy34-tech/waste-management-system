"""
RouteOptimizer — future-technology interface (spec section 26/51).

MVP implementation: deterministic nearest-neighbour ordering using real
PostGIS distance calculations. NOT machine-learned route optimization.
A future ML-based optimizer can be dropped in by implementing the same
`RouteOptimizer` interface without touching the collection system.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Stop:
    id: str
    latitude: float
    longitude: float


class RouteOptimizer(ABC):
    @abstractmethod
    def order_stops(self, origin: Stop, stops: list[Stop]) -> list[Stop]:
        """Return `stops` ordered into a route starting from `origin`."""
        raise NotImplementedError


class DeterministicNearestNeighbourOptimizer(RouteOptimizer):
    """
    MVP implementation. Greedy nearest-neighbour using haversine distance —
    simple, explainable, and fast enough for typical zone-sized stop counts.
    This is intentionally NOT an ML/AI route optimizer.
    """

    def order_stops(self, origin: Stop, stops: list[Stop]) -> list[Stop]:
        import math

        def haversine(a: Stop, b: Stop) -> float:
            r = 6371000
            lat1, lat2 = math.radians(a.latitude), math.radians(b.latitude)
            dlat = math.radians(b.latitude - a.latitude)
            dlon = math.radians(b.longitude - a.longitude)
            h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
            return 2 * r * math.asin(math.sqrt(h))

        remaining = list(stops)
        ordered = []
        current = origin
        while remaining:
            nearest = min(remaining, key=lambda s: haversine(current, s))
            ordered.append(nearest)
            remaining.remove(nearest)
            current = nearest
        return ordered


# Future (Phase 2, NOT implemented): MLRouteOptimizer(RouteOptimizer) using
# historical traffic/collection-time data. Documented in docs/future-roadmap.md.
