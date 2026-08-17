"""
Seed script — populates realistic demo/development data covering every role.

Usage:
    PYTHONPATH=. python scripts/seed.py

All accounts use obviously fake, clearly-labeled development credentials.
Never run this against a production database.
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import SessionLocal, Base, engine
from app.core.geo import point_from_latlng
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
from app.models.bins_complaints import Bin, Complaint
from app.models.notifications_audit import Notification, NotificationType
from app.models.operations import Collector, CollectionZone, Vehicle
from app.models.pickup import Collection, PickupRequest, WasteRecord
from app.models.recycling_rewards import RecyclingRecord, Reward, RewardRule
from app.models.tenant import Organization, RecyclingPartner, WasteCompany
from app.models.user import User
from app.security.auth import hash_password

# Realistic Kampala/Wakiso/Mukono area coordinates for demo data.
LOCATIONS = {
    "Ntinda": (0.3476, 32.5825),
    "Kololo": (0.3350, 32.5950),
    "Nakawa": (0.3300, 32.6150),
    "Makerere": (0.3350, 32.5650),
    "Wakiso Town": (0.4044, 32.4592),
    "Mukono Town": (0.3533, 32.7553),
    "Kampala Central Market": (0.3136, 32.5811),
    "Ntinda Market": (0.3490, 32.5870),
}

DEV_PASSWORD = "EcoTrackDev123"  # NOSONAR — obviously fake, documented dev-only credential


def seed():
    print("Creating tables if not present...")
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == "superadmin@ecotrack.dev").first():
            print("Seed data already present — skipping (delete rows or drop DB to reseed).")
            return

        print("Seeding waste companies, organizations, recycling partners...")
        company = WasteCompany(name="Kampala Clean Collectors Ltd", contact_email="ops@kcc.ug", municipality_name="Kampala Capital City Authority")
        db.add(company)

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
        db.flush()

        print("Seeding users for every role (dev password: %s)..." % DEV_PASSWORD)
        users = {}

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
            users[email] = u
            return u

        make_user("superadmin@ecotrack.dev", "Grace Namutebi", UserRole.SUPER_ADMIN)
        make_user("municipal@ecotrack.dev", "Robert Ssekandi", UserRole.MUNICIPAL_ADMIN)
        make_user("company@ecotrack.dev", "Patricia Nabirye", UserRole.COMPANY_ADMIN, waste_company_id=company.id)
        make_user("orgadmin@ecotrack.dev", "David Mugisha", UserRole.ORGANIZATION_ADMIN, organization_id=org.id)
        make_user("recycler@ecotrack.dev", "Sarah Achieng", UserRole.RECYCLER, recycler_id=recycler.id)
        citizen1 = make_user("citizen@ecotrack.dev", "Amina Nakato", UserRole.CITIZEN, phone_number="+256700111222")
        citizen2 = make_user("citizen2@ecotrack.dev", "John Okwir", UserRole.CITIZEN, phone_number="+256700222333")
        collector_user = make_user("collector@ecotrack.dev", "Musa Okello", UserRole.COLLECTOR, waste_company_id=company.id, phone_number="+256700333444")

        print("Seeding collector profile, vehicle, zone...")
        vehicle = Vehicle(
            waste_company_id=company.id,
            registration_number="UAX 123K",
            vehicle_type="Compactor Truck",
            capacity_kg=3000,
            status=VehicleStatus.AVAILABLE,
        )
        db.add(vehicle)
        db.flush()

        zone_ring = "32.55 0.32, 32.62 0.32, 32.62 0.36, 32.55 0.36, 32.55 0.32"
        from sqlalchemy import func

        zone = CollectionZone(name="Ntinda-Nakawa Zone", waste_company_id=company.id, boundary=func.ST_GeomFromText(f"POLYGON(({zone_ring}))", 4326))
        db.add(zone)
        db.flush()

        collector = Collector(
            user_id=collector_user.id,
            waste_company_id=company.id,
            assigned_zone_id=zone.id,
            assigned_vehicle_id=vehicle.id,
            last_known_location=point_from_latlng(*LOCATIONS["Ntinda"]),
        )
        db.add(collector)
        vehicle.assigned_driver_id = collector.id if False else vehicle.assigned_driver_id  # set after flush below
        db.flush()
        vehicle.assigned_driver_id = collector.id

        print("Seeding bins...")
        for i, (name, coords) in enumerate(LOCATIONS.items()):
            db.add(
                Bin(
                    code=f"BIN-{i+1:03d}",
                    bin_type="general" if i % 2 == 0 else "recycling",
                    capacity_liters=240,
                    location=point_from_latlng(*coords),
                    zone_id=zone.id,
                    waste_company_id=company.id,
                    current_fill_percent=[20, 45, 80, 95, 10, 60, 30, 70][i % 8],
                    status=BinStatus.ACTIVE,
                )
            )

        print("Seeding pickups + a completed collection...")
        p1 = PickupRequest(
            requester_user_id=citizen1.id,
            waste_category=WasteCategory.PLASTIC,
            location=point_from_latlng(*LOCATIONS["Ntinda"]),
            address_text="Plot 12, Ntinda Road",
            status=PickupStatus.REQUESTED,
        )
        db.add(p1)

        p2 = PickupRequest(
            requester_user_id=citizen2.id,
            waste_company_id=company.id,
            assigned_collector_id=collector.id,
            waste_category=WasteCategory.ORGANIC,
            location=point_from_latlng(*LOCATIONS["Kololo"]),
            address_text="Kololo Hill Drive",
            status=PickupStatus.COLLECTED,
        )
        db.add(p2)
        db.flush()

        completed = Collection(
            pickup_request_id=p2.id,
            collector_id=collector.id,
            completed_at=datetime.now(timezone.utc) - timedelta(days=1),
            quantity_kg=18.5,
            waste_category=WasteCategory.ORGANIC,
            was_successful=True,
            completion_notes="Collected on schedule.",
        )
        db.add(completed)
        db.add(
            WasteRecord(
                waste_company_id=company.id,
                collector_id=collector.id,
                category=WasteCategory.ORGANIC,
                quantity_kg=18.5,
                recorded_at=datetime.now(timezone.utc) - timedelta(days=1),
                location=point_from_latlng(*LOCATIONS["Kololo"]),
            )
        )

        print("Seeding a complaint...")
        db.add(
            Complaint(
                reporter_user_id=citizen1.id,
                category=ComplaintCategory.ILLEGAL_DUMPING,
                description="Pile of mixed waste dumped behind Kampala Central Market.",
                location=point_from_latlng(*LOCATIONS["Kampala Central Market"]),
                status=ComplaintStatus.REPORTED,
            )
        )

        print("Seeding recycling record...")
        db.add(
            RecyclingRecord(
                recycler_id=recycler.id,
                waste_category=WasteCategory.PLASTIC,
                quantity_kg=120.0,
                received_date=date.today() - timedelta(days=2),
                destination="Wakiso Green Recyclers processing plant",
            )
        )

        print("Seeding reward rules and a redeemable reward...")
        db.add(RewardRule(activity_type="VERIFIED_PICKUP", points=10, description="Points for a verified, completed pickup"))
        db.add(RewardRule(activity_type="RECYCLING_ACTIVITY", points=15, description="Points for logged recycling activity"))
        db.add(Reward(name="EcoTrack Reusable Tote Bag", description="A durable reusable tote", points_cost=50, stock=100))

        db.commit()
        print("\nSeed complete.")
        print("=" * 60)
        print(f"Development password for ALL seeded accounts: {DEV_PASSWORD}")
        print("Accounts:")
        for email in users:
            print(f"  - {email} ({users[email].role.value})")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
