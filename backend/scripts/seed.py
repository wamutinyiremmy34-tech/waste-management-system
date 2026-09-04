"""
Seed script — populates realistic demo/development data covering every role.

Phase 2: enriched seed with 30+ days of history, 100+ pickups, 5+ collectors,
15+ complaints in geographic clusters, daily WasteRecords, PointsLedgerEntries
and RecyclingRecords — enough for all intelligence features to produce
meaningful output.

Usage:
    PYTHONPATH=. python scripts/seed.py

All accounts use obviously fake, clearly-labeled development credentials.
Never run this against a production database.
"""
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import Base, SessionLocal, engine
from app.core.geo import point_from_latlng
from app.models.bins_complaints import Bin, Complaint
from app.models.enums import (
    BinStatus,
    ComplaintCategory,
    ComplaintStatus,
    OrganizationType,
    PickupStatus,
    UserRole,
    VehicleStatus,
    WasteCategory,
)
from app.models.notifications_audit import Notification, NotificationType
from app.models.operations import Collector, CollectionZone, Vehicle
from app.models.pickup import Collection, PickupRequest, WasteRecord
from app.models.recycling_rewards import (
    PointsLedgerEntry,
    RecyclingRecord,
    Reward,
    RewardRule,
)
from app.models.tenant import Organization, RecyclingPartner, WasteCompany
from app.models.user import User
from app.security.auth import hash_password

# ---------------------------------------------------------------------------
# Realistic Kampala / Wakiso / Mukono coordinates
# ---------------------------------------------------------------------------
LOCATIONS = {
    "Ntinda":                   (0.3476, 32.5825),
    "Kololo":                   (0.3350, 32.5950),
    "Nakawa":                   (0.3300, 32.6150),
    "Makerere":                 (0.3350, 32.5650),
    "Wakiso Town":              (0.4044, 32.4592),
    "Mukono Town":              (0.3533, 32.7553),
    "Kampala Central Market":   (0.3136, 32.5811),
    "Ntinda Market":            (0.3490, 32.5870),
    "Kisementi":                (0.3415, 32.5898),
    "Bugolobi":                 (0.3267, 32.6050),
    "Muyenga":                  (0.3050, 32.6000),
    "Kansanga":                 (0.3000, 32.5900),
    "Kamwokya":                 (0.3420, 32.5820),
    "Mengo":                    (0.3210, 32.5680),
    "Kawempe":                  (0.3650, 32.5620),
}

# Hotspot cluster — many complaints concentrated near Owino/St Balikuddembe Market
OWINO_CLUSTER = [
    (0.3141, 32.5814),
    (0.3145, 32.5820),
    (0.3138, 32.5808),
    (0.3150, 32.5825),
    (0.3135, 32.5816),
    (0.3148, 32.5812),
]

# Hotspot cluster — illegal dumping near Nakawa Industrial Area
NAKAWA_CLUSTER = [
    (0.3302, 32.6148),
    (0.3308, 32.6155),
    (0.3295, 32.6140),
    (0.3312, 32.6145),
    (0.3298, 32.6160),
]

DEV_PASSWORD = "EcoTrackDev123"  # NOSONAR — obviously fake, dev-only


def _dt(days_ago: int, hour: int = 9) -> datetime:
    """Utility: a timezone-aware datetime N days ago."""
    return datetime.now(timezone.utc) - timedelta(days=days_ago) + timedelta(hours=hour - 9)


def _date(days_ago: int) -> date:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).date()


def seed():
    print("Creating tables if not present...")
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == "superadmin@ecotrack.dev").first():
            print("Seed data already present — skipping (delete rows or drop DB to reseed).")
            return

        rng = random.Random(42)  # deterministic for reproducibility

        # ------------------------------------------------------------------
        # Tenants
        # ------------------------------------------------------------------
        print("Seeding waste companies, organizations, recycling partners...")

        company = WasteCompany(
            name="Kampala Clean Collectors Ltd",
            contact_email="ops@kcc.ug",
            municipality_name="Kampala Capital City Authority",
        )
        db.add(company)

        company2 = WasteCompany(
            name="Wakiso Waste Solutions",
            contact_email="info@wakisowaste.ug",
            municipality_name="Wakiso District Local Government",
        )
        db.add(company2)

        recycler = RecyclingPartner(
            name="Wakiso Green Recyclers",
            contact_email="info@wakisogreen.ug",
            location=point_from_latlng(*LOCATIONS["Wakiso Town"]),
            accepted_categories="PLASTIC,PAPER,GLASS,METAL",
        )
        db.add(recycler)

        org = Organization(
            name="Ntinda Secondary School",
            org_type=OrganizationType.SCHOOL,
            contact_email="admin@ntindasecondary.ac.ug",
            location=point_from_latlng(*LOCATIONS["Ntinda"]),
            address_text="Ntinda Road, Kampala",
        )
        db.add(org)

        org2 = Organization(
            name="Kololo Apartments Complex",
            org_type=OrganizationType.APARTMENT,
            contact_email="manager@kololoapts.ug",
            location=point_from_latlng(*LOCATIONS["Kololo"]),
            address_text="Kololo Hill Drive, Kampala",
        )
        db.add(org2)

        db.flush()

        # ------------------------------------------------------------------
        # Users
        # ------------------------------------------------------------------
        print("Seeding users for all roles...")

        def make_user(email, full_name, role, **kwargs):
            u = User(
                email=email,
                hashed_password=hash_password(DEV_PASSWORD),
                full_name=full_name,
                role=role,
                is_active=True,
                is_email_verified=True,
                **kwargs,
            )
            db.add(u)
            db.flush()
            return u

        super_admin = make_user("superadmin@ecotrack.dev", "Grace Namutebi", UserRole.SUPER_ADMIN)
        municipal = make_user("municipal@ecotrack.dev", "Robert Ssekandi", UserRole.MUNICIPAL_ADMIN)
        company_admin = make_user("company@ecotrack.dev", "Patricia Nabirye", UserRole.COMPANY_ADMIN, waste_company_id=company.id)
        make_user("company2@ecotrack.dev", "Brian Mukasa", UserRole.COMPANY_ADMIN, waste_company_id=company2.id)
        make_user("orgadmin@ecotrack.dev", "David Mugisha", UserRole.ORGANIZATION_ADMIN, organization_id=org.id)
        make_user("orgadmin2@ecotrack.dev", "Esther Nalwanga", UserRole.ORGANIZATION_ADMIN, organization_id=org2.id)
        recycler_user = make_user("recycler@ecotrack.dev", "Sarah Achieng", UserRole.RECYCLER, recycler_id=recycler.id)

        # Citizens
        citizens = []
        citizen_data = [
            ("citizen@ecotrack.dev", "Amina Nakato", "+256700111222"),
            ("citizen2@ecotrack.dev", "John Okwir", "+256700222333"),
            ("citizen3@ecotrack.dev", "Fatuma Nakazibwe", "+256700334455"),
            ("citizen4@ecotrack.dev", "Peter Ssali", "+256700445566"),
            ("citizen5@ecotrack.dev", "Rose Akello", "+256700556677"),
        ]
        for email, name, phone in citizen_data:
            citizens.append(make_user(email, name, UserRole.CITIZEN, phone_number=phone))

        # Collectors
        collector_users = []
        collector_data = [
            ("collector@ecotrack.dev",  "Musa Okello",    "+256700333444"),
            ("collector2@ecotrack.dev", "James Kizito",   "+256700667788"),
            ("collector3@ecotrack.dev", "Agnes Namatovu", "+256700778899"),
            ("collector4@ecotrack.dev", "Hassan Nsubuga", "+256700889900"),
            ("collector5@ecotrack.dev", "Diana Nakayima", "+256700990011"),
        ]
        for email, name, phone in collector_data:
            collector_users.append(
                make_user(email, name, UserRole.COLLECTOR, waste_company_id=company.id, phone_number=phone)
            )

        # ------------------------------------------------------------------
        # Vehicles
        # ------------------------------------------------------------------
        print("Seeding vehicles...")
        from sqlalchemy import func

        vehicle_data = [
            ("UAX 123K", "Compactor Truck",   3000, VehicleStatus.AVAILABLE),
            ("UAX 456L", "Tipping Truck",      5000, VehicleStatus.AVAILABLE),
            ("UAX 789M", "Compactor Truck",    3000, VehicleStatus.MAINTENANCE),
            ("UAB 321N", "Pick-up Truck",       800, VehicleStatus.AVAILABLE),
            ("UAB 654P", "Hand-pushed Cart",     80, VehicleStatus.IN_SERVICE),
        ]
        vehicles = []
        for reg, vtype, cap, status in vehicle_data:
            v = Vehicle(
                waste_company_id=company.id,
                registration_number=reg,
                vehicle_type=vtype,
                capacity_kg=cap,
                status=status,
            )
            db.add(v)
            vehicles.append(v)
        db.flush()

        # ------------------------------------------------------------------
        # Collection zones (3 zones with PostGIS polygons)
        # ------------------------------------------------------------------
        print("Seeding collection zones...")

        def make_zone(name, ring_wkt):
            z = CollectionZone(
                name=name,
                waste_company_id=company.id,
                boundary=func.ST_GeomFromText(f"POLYGON(({ring_wkt}))", 4326),
            )
            db.add(z)
            db.flush()
            return z

        # Ntinda-Kisementi-Nakawa belt
        zone1 = make_zone(
            "Zone A — Ntinda-Nakawa",
            "32.57 0.33, 32.63 0.33, 32.63 0.36, 32.57 0.36, 32.57 0.33",
        )
        # Kololo-Kamwokya-Makerere hill
        zone2 = make_zone(
            "Zone B — Kololo-Makerere",
            "32.55 0.32, 32.60 0.32, 32.60 0.35, 32.55 0.35, 32.55 0.32",
        )
        # Kampala Central-Mengo-Muyenga
        zone3 = make_zone(
            "Zone C — Central-Muyenga",
            "32.56 0.29, 32.62 0.29, 32.62 0.33, 32.56 0.33, 32.56 0.29",
        )

        # ------------------------------------------------------------------
        # Collector profiles
        # ------------------------------------------------------------------
        print("Seeding collector profiles...")
        collector_loc_keys = list(LOCATIONS.keys())[:5]
        collector_zone_map = [zone1, zone1, zone2, zone2, zone3]
        collector_vehicle_map = vehicles[:5]

        collectors = []
        for i, cu in enumerate(collector_users):
            loc_key = collector_loc_keys[i % len(collector_loc_keys)]
            c = Collector(
                user_id=cu.id,
                waste_company_id=company.id,
                assigned_zone_id=collector_zone_map[i].id,
                assigned_vehicle_id=collector_vehicle_map[i].id,
                last_known_location=point_from_latlng(*LOCATIONS[loc_key]),
            )
            db.add(c)
            collectors.append(c)
        db.flush()
        # Assign drivers to vehicles
        for i, v in enumerate(vehicles[:5]):
            v.assigned_driver_id = collectors[i].id

        # ------------------------------------------------------------------
        # Bins (16 bins across zones)
        # ------------------------------------------------------------------
        print("Seeding bins...")
        bin_locations = list(LOCATIONS.items())
        fill_levels = [20, 45, 80, 95, 10, 60, 30, 70, 55, 85, 15, 90, 40, 65, 25, 50]
        zone_for_bin = [zone1, zone1, zone1, zone2, zone2, zone2, zone3, zone3,
                        zone1, zone2, zone3, zone1, zone2, zone3, zone1, zone2]

        for i, (loc_name, coords) in enumerate(bin_locations):
            fill = fill_levels[i % len(fill_levels)]
            status = BinStatus.FULL if fill >= 90 else BinStatus.ACTIVE
            db.add(Bin(
                code=f"BIN-{i+1:03d}",
                bin_type="recycling" if i % 3 == 0 else "general",
                capacity_liters=240,
                location=point_from_latlng(*coords),
                zone_id=zone_for_bin[i % len(zone_for_bin)].id,
                waste_company_id=company.id,
                current_fill_percent=fill,
                status=status,
            ))

        # ------------------------------------------------------------------
        # Complaints — 2 realistic geographic hotspot clusters
        # ------------------------------------------------------------------
        print("Seeding complaints with geographic clusters...")

        complaint_ages = [35, 30, 28, 25, 22, 20, 18, 16, 14, 12, 10, 8, 7, 5, 3, 2, 1]

        # Cluster 1: Owino market illegal dumping cluster (6 complaints)
        for i, (lat, lng) in enumerate(OWINO_CLUSTER):
            age = complaint_ages[i % len(complaint_ages)]
            status = ComplaintStatus.RESOLVED if i < 2 else ComplaintStatus.REPORTED
            db.add(Complaint(
                reporter_user_id=citizens[i % len(citizens)].id,
                category=ComplaintCategory.ILLEGAL_DUMPING,
                description=f"Large pile of mixed waste dumped behind stalls near Owino Market. Blocking drainage channel.",
                location=point_from_latlng(lat, lng),
                status=status,
                resolved_at=_dt(age - 2) if status == ComplaintStatus.RESOLVED else None,
            ))

        # Cluster 2: Nakawa industrial illegal dumping (5 complaints)
        for i, (lat, lng) in enumerate(NAKAWA_CLUSTER):
            age = complaint_ages[i + 3]
            db.add(Complaint(
                reporter_user_id=citizens[(i + 1) % len(citizens)].id,
                category=ComplaintCategory.ILLEGAL_DUMPING,
                description="Industrial waste illegally dumped near Nakawa Market — includes plastics and metal scrap.",
                location=point_from_latlng(lat, lng),
                status=ComplaintStatus.UNDER_REVIEW,
            ))

        # Scattered complaints (overflowing bins, missed collections)
        scattered = [
            (LOCATIONS["Ntinda"],              ComplaintCategory.OVERFLOWING_BIN,      "Bin BIN-001 overflowing. Has not been collected for 5 days."),
            (LOCATIONS["Kololo"],              ComplaintCategory.MISSED_COLLECTION,     "Scheduled collection missed — third week in a row."),
            (LOCATIONS["Makerere"],            ComplaintCategory.OVERFLOWING_BIN,      "Recycling bin full, waste spilling onto pavement."),
            (LOCATIONS["Nakawa"],              ComplaintCategory.ENVIRONMENTAL_HAZARD,  "Chemical waste visible near storm drain."),
            (LOCATIONS["Kamwokya"],            ComplaintCategory.MISSED_COLLECTION,     "Organic waste not collected for 4 days. Strong smell."),
            (LOCATIONS["Kampala Central Market"], ComplaintCategory.DAMAGED_BIN,        "Bin BIN-007 has a broken lid, attracting pests."),
        ]
        for i, ((lat, lng), cat, desc) in enumerate(scattered):
            age = complaint_ages[i + 8]
            db.add(Complaint(
                reporter_user_id=citizens[i % len(citizens)].id,
                category=cat,
                description=desc,
                location=point_from_latlng(lat, lng),
                status=ComplaintStatus.REPORTED,
            ))

        db.flush()

        # ------------------------------------------------------------------
        # Pickup requests + collections — 30 days of history
        # ------------------------------------------------------------------
        print("Seeding pickup requests and collections (30 days of history)...")

        loc_list = list(LOCATIONS.values())
        categories = list(WasteCategory)
        # Weighted categories matching Kampala waste composition
        cat_weights = [30, 20, 15, 5, 10, 2, 3, 10, 5]  # ORGANIC, PLASTIC, PAPER, GLASS, METAL, ELEC, HAZ, MIXED, OTHER

        pickup_count = 0
        collection_count = 0
        points_entries = []

        for days_ago in range(35, 0, -1):
            # 3-7 pickups per day
            n_pickups = rng.randint(3, 7)
            for _ in range(n_pickups):
                citizen = rng.choice(citizens)
                loc = rng.choice(loc_list)
                cat = rng.choices(categories, weights=cat_weights, k=1)[0]
                collector = rng.choice(collectors)

                # Decide status based on age
                if days_ago > 5:
                    # Older pickups: mostly completed, some failed/missed
                    r = rng.random()
                    if r < 0.75:
                        status = PickupStatus.COLLECTED
                    elif r < 0.87:
                        status = PickupStatus.FAILED
                    elif r < 0.93:
                        status = PickupStatus.MISSED
                    else:
                        status = PickupStatus.CANCELLED
                elif days_ago > 2:
                    r = rng.random()
                    if r < 0.6:
                        status = PickupStatus.COLLECTED
                    elif r < 0.75:
                        status = PickupStatus.ASSIGNED
                    elif r < 0.85:
                        status = PickupStatus.EN_ROUTE
                    elif r < 0.92:
                        status = PickupStatus.FAILED
                    else:
                        status = PickupStatus.REQUESTED
                else:
                    status = rng.choice([PickupStatus.REQUESTED, PickupStatus.ASSIGNED, PickupStatus.EN_ROUTE])

                pickup = PickupRequest(
                    requester_user_id=citizen.id,
                    waste_company_id=company.id,
                    assigned_collector_id=collector.id if status != PickupStatus.REQUESTED else None,
                    waste_category=cat,
                    location=point_from_latlng(*loc),
                    address_text=rng.choice(list(LOCATIONS.keys())),
                    status=status,
                    preferred_date=_date(days_ago),
                )
                db.add(pickup)
                db.flush()
                pickup_count += 1

                # Create collection record for terminal statuses
                if status in (PickupStatus.COLLECTED, PickupStatus.FAILED, PickupStatus.MISSED):
                    qty = round(rng.uniform(5, 80), 1) if status == PickupStatus.COLLECTED else None
                    coll = Collection(
                        pickup_request_id=pickup.id,
                        collector_id=collector.id,
                        completed_at=_dt(days_ago, rng.randint(8, 17)),
                        quantity_kg=qty,
                        waste_category=cat if status == PickupStatus.COLLECTED else None,
                        was_successful=(status == PickupStatus.COLLECTED),
                        failure_reason=(
                            rng.choice(["Access road blocked", "Customer not home", "Bin not set out", "Vehicle breakdown"])
                            if status in (PickupStatus.FAILED, PickupStatus.MISSED) else None
                        ),
                        collection_location=point_from_latlng(*loc) if status == PickupStatus.COLLECTED else None,
                    )
                    db.add(coll)
                    collection_count += 1

                    if status == PickupStatus.COLLECTED and qty:
                        # WasteRecord
                        db.add(WasteRecord(
                            waste_company_id=company.id,
                            collector_id=collector.id,
                            collection_id=coll.id,
                            category=cat,
                            quantity_kg=qty,
                            recorded_at=_dt(days_ago, rng.randint(8, 17)),
                            location=point_from_latlng(*loc),
                        ))
                        # Points for citizen
                        points_entries.append(PointsLedgerEntry(
                            user_id=citizen.id,
                            activity_type="VERIFIED_PICKUP",
                            points=10,
                            reference_id=pickup.id,
                            note="Verified pickup completed",
                        ))

        db.flush()

        # Add a handful of overdue/unassigned pickups for attention items
        for i in range(5):
            loc = rng.choice(loc_list)
            cat = rng.choices(categories, weights=cat_weights, k=1)[0]
            pickup = PickupRequest(
                requester_user_id=rng.choice(citizens).id,
                waste_category=cat,
                location=point_from_latlng(*loc),
                address_text=rng.choice(list(LOCATIONS.keys())),
                status=PickupStatus.REQUESTED,
                preferred_date=_date(rng.randint(3, 10)),  # overdue
            )
            db.add(pickup)
            pickup_count += 1

        # ------------------------------------------------------------------
        # Organization pickups (org1 = Ntinda Secondary School)
        # ------------------------------------------------------------------
        for days_ago in range(20, 0, -3):
            cat = rng.choice([WasteCategory.ORGANIC, WasteCategory.PLASTIC, WasteCategory.PAPER])
            collector = rng.choice(collectors)
            status = PickupStatus.COLLECTED if days_ago > 3 else PickupStatus.REQUESTED
            p = PickupRequest(
                requester_user_id=citizens[0].id,
                organization_id=org.id,
                waste_company_id=company.id,
                assigned_collector_id=collector.id if status == PickupStatus.COLLECTED else None,
                waste_category=cat,
                location=point_from_latlng(*LOCATIONS["Ntinda"]),
                address_text="Ntinda Secondary School",
                status=status,
                preferred_date=_date(days_ago),
            )
            db.add(p)
            db.flush()
            pickup_count += 1

            if status == PickupStatus.COLLECTED:
                qty = round(rng.uniform(30, 120), 1)
                coll = Collection(
                    pickup_request_id=p.id,
                    collector_id=collector.id,
                    completed_at=_dt(days_ago, 10),
                    quantity_kg=qty,
                    waste_category=cat,
                    was_successful=True,
                )
                db.add(coll)
                db.add(WasteRecord(
                    source_organization_id=org.id,
                    waste_company_id=company.id,
                    collector_id=collector.id,
                    category=cat,
                    quantity_kg=qty,
                    recorded_at=_dt(days_ago, 10),
                    location=point_from_latlng(*LOCATIONS["Ntinda"]),
                ))
                collection_count += 1

        db.flush()

        # ------------------------------------------------------------------
        # Recycling records (30 days, multiple categories)
        # ------------------------------------------------------------------
        print("Seeding recycling records...")
        recycling_data = [
            (WasteCategory.PLASTIC, 80, 120),
            (WasteCategory.PAPER,   30,  60),
            (WasteCategory.GLASS,   10,  25),
            (WasteCategory.METAL,   20,  50),
        ]
        for days_ago in range(30, 0, -3):
            for cat, lo, hi in recycling_data:
                qty = round(rng.uniform(lo, hi), 1)
                db.add(RecyclingRecord(
                    recycler_id=recycler.id,
                    waste_category=cat,
                    quantity_kg=qty,
                    received_date=_date(days_ago),
                    destination="Wakiso Green Recyclers processing plant",
                    source_organization_id=org.id if rng.random() < 0.3 else None,
                ))

        # ------------------------------------------------------------------
        # Points ledger (add all collected entries)
        # ------------------------------------------------------------------
        print("Seeding points ledger entries...")
        for entry in points_entries:
            db.add(entry)

        # Bonus points for some citizens
        for citizen in citizens[:3]:
            db.add(PointsLedgerEntry(
                user_id=citizen.id,
                activity_type="RECYCLING_ACTIVITY",
                points=15,
                note="Recycling activity logged",
            ))

        # ------------------------------------------------------------------
        # Reward rules and catalog
        # ------------------------------------------------------------------
        db.add(RewardRule(activity_type="VERIFIED_PICKUP", points=10, description="Points awarded when your pickup is verified and completed by a collector"))
        db.add(RewardRule(activity_type="RECYCLING_ACTIVITY", points=15, description="Points for logging recycling activity"))
        db.add(Reward(name="EcoTrack Reusable Tote Bag", description="Durable branded tote", points_cost=50, stock=100))
        db.add(Reward(name="Tree Planting Certificate", description="1 tree planted on your behalf with Green Uganda", points_cost=100, stock=500))
        db.add(Reward(name="Solar Phone Charger Voucher", description="Discount voucher for partner solar charger shops", points_cost=200, stock=50))

        # ------------------------------------------------------------------
        # Commit
        # ------------------------------------------------------------------
        db.commit()

        print(f"\nSeed complete.")
        print("=" * 60)
        print(f"Development password for ALL seeded accounts: {DEV_PASSWORD}")
        print(f"Pickups seeded: {pickup_count}")
        print(f"Collections seeded: {collection_count}")
        print("Accounts:")
        accounts = [
            ("superadmin@ecotrack.dev",  "SUPER_ADMIN"),
            ("municipal@ecotrack.dev",   "MUNICIPAL_ADMIN"),
            ("company@ecotrack.dev",     "COMPANY_ADMIN (Kampala Clean Collectors)"),
            ("company2@ecotrack.dev",    "COMPANY_ADMIN (Wakiso Waste Solutions)"),
            ("orgadmin@ecotrack.dev",    "ORGANIZATION_ADMIN (Ntinda Secondary School)"),
            ("orgadmin2@ecotrack.dev",   "ORGANIZATION_ADMIN (Kololo Apartments)"),
            ("recycler@ecotrack.dev",    "RECYCLER"),
            ("citizen@ecotrack.dev",     "CITIZEN"),
            ("citizen2@ecotrack.dev",    "CITIZEN"),
            ("collector@ecotrack.dev",   "COLLECTOR"),
            ("collector2@ecotrack.dev",  "COLLECTOR"),
            ("collector3@ecotrack.dev",  "COLLECTOR"),
            ("collector4@ecotrack.dev",  "COLLECTOR"),
            ("collector5@ecotrack.dev",  "COLLECTOR"),
        ]
        for email, role in accounts:
            print(f"  - {email} ({role})")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    seed()
