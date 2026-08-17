"""
E2E: collector login → view assigned pickup → advance status → complete
collection with proof data. Uses the seeded demo accounts (see
backend/scripts/seed.py) so this test needs the dev database seeded and a
pickup actually assigned to the seeded collector before it runs — see
`setup_assigned_pickup` which creates one via the real API (not the UI,
since setting up test fixtures via API calls is standard E2E practice —
the UI itself is driven for every step that's actually under test).

Each run creates a pickup with a unique address marker and scopes every
button lookup to that specific pickup's card — not a bare global XPath —
because running the full E2E suite repeatedly (or alongside other tests)
leaves multiple pickups in ASSIGNED/EN_ROUTE/ARRIVED states from earlier
runs, and a global lookup would non-deterministically grab whichever
button renders first rather than the one this run created. This exact
flakiness was found by running the suite together and reproduced
reliably before being fixed — see docs/testing.md.
"""
import uuid

import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from conftest import FRONTEND_URL, api_login, wait_for, wait_for_url_contains

API_BASE = "http://localhost:8000/api/v1"


def setup_assigned_pickup(address_marker: str) -> str:
    """
    Creates a fresh pickup and assigns it to the seeded collector via the
    real API, so this E2E run always has something to act on regardless of
    what earlier test runs left behind.
    """
    citizen_login = api_login("citizen2@ecotrack.dev", "EcoTrackDev123")
    citizen_token = citizen_login["access_token"]

    pickup = requests.post(
        f"{API_BASE}/pickups",
        headers={"Authorization": f"Bearer {citizen_token}"},
        json={"waste_category": "METAL", "latitude": 0.34, "longitude": 32.58, "address_text": address_marker},
    ).json()

    company_login = api_login("company@ecotrack.dev", "EcoTrackDev123")
    company_token = company_login["access_token"]

    collector_login = api_login("collector@ecotrack.dev", "EcoTrackDev123")
    collector_profile = requests.get(
        f"{API_BASE}/collectors/me", headers={"Authorization": f"Bearer {collector_login['access_token']}"}
    ).json()

    requests.post(
        f"{API_BASE}/pickups/{pickup['id']}/assign",
        headers={"Authorization": f"Bearer {company_token}"},
        json={"collector_id": collector_profile["id"]},
    )
    return pickup["id"]


def find_pickup_card(driver, address_marker: str):
    return driver.find_element(
        By.XPATH, f"//div[contains(@class,'rounded-lg') and .//p[contains(text(), '{address_marker}')]]"
    )


def test_collector_login_view_assignment_advance_and_complete(driver):
    address_marker = f"E2E Test Address {uuid.uuid4().hex[:8]}"
    setup_assigned_pickup(address_marker)

    # --- Login as the seeded collector ---
    driver.get(f"{FRONTEND_URL}/login")
    wait_for(driver, By.CSS_SELECTOR, "input[type=email]").send_keys("collector@ecotrack.dev")
    driver.find_element(By.CSS_SELECTOR, "input[type=password]").send_keys("EcoTrackDev123")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    # A COLLECTOR is routed to /collector, not the generic dashboard.
    wait_for_url_contains(driver, "/collector", timeout=10)

    # --- Confirm the real assigned pickup is visible ---
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), address_marker))

    # --- Click "Start route" (ASSIGNED -> EN_ROUTE), scoped to this pickup's own card ---
    card = find_pickup_card(driver, address_marker)
    card.find_element(By.XPATH, ".//button[contains(text(), 'Start route')]").click()
    WebDriverWait(driver, 10).until(lambda d: "EN ROUTE" in find_pickup_card(d, address_marker).text)

    # --- Click "Mark arrived" (EN_ROUTE -> ARRIVED), scoped to this pickup's own card ---
    card = find_pickup_card(driver, address_marker)
    card.find_element(By.XPATH, ".//button[contains(text(), 'Mark arrived')]").click()
    WebDriverWait(driver, 10).until(lambda d: "ARRIVED" in find_pickup_card(d, address_marker).text)

    # --- Complete the collection with a real weight, scoped to this pickup's own card ---
    card = find_pickup_card(driver, address_marker)
    card.find_element(By.XPATH, ".//button[contains(text(), 'Complete collection')]").click()

    weight_input = wait_for(driver, By.CSS_SELECTOR, "input[type=number]")
    weight_input.send_keys("9.3")
    driver.find_element(By.XPATH, "//button[contains(text(), 'Submit')]").click()

    # --- Confirm the real completed state now shows in this pickup's own card ---
    WebDriverWait(driver, 10).until(lambda d: "COLLECTED" in find_pickup_card(d, address_marker).text)
