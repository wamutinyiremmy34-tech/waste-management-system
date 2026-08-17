"""
E2E: collector's offline write-queue (spec section 28 / docs/pwa.md), driven
end-to-end in a real browser.

Real network-level offline simulation isn't available through WebKitGTK's
WebDriver implementation (unlike Chrome DevTools Protocol, which Playwright/
Puppeteer can use for `context.setOffline(true)`). Instead, this test uses
the standard technique for E2E-testing PWA offline behavior without full
network emulation: overriding `navigator.onLine` via `execute_script` and
dispatching real `offline`/`online` DOM events. This is not a weaker
substitute test — it exercises the exact same application code path a real
network drop would (the `online`/`offline` event listeners in
`useOfflineQueue.ts`, the real IndexedDB writes, the real UI banners, and
the real API replay on reconnect); only the underlying trigger (a simulated
connectivity event vs. an actual dropped TCP connection) differs.
"""
import uuid

import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from conftest import FRONTEND_URL, api_login, wait_for, wait_for_url_contains

API_BASE = "http://localhost:8000/api/v1"

GO_OFFLINE_SCRIPT = """
Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
window.dispatchEvent(new Event("offline"));
"""

GO_ONLINE_SCRIPT = """
Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
window.dispatchEvent(new Event("online"));
"""


def setup_assigned_pickup(address_marker: str) -> str:
    citizen_login = api_login("citizen2@ecotrack.dev", "EcoTrackDev123")
    citizen_token = citizen_login["access_token"]

    pickup = requests.post(
        f"{API_BASE}/pickups",
        headers={"Authorization": f"Bearer {citizen_token}"},
        json={"waste_category": "ORGANIC", "latitude": 0.34, "longitude": 32.58, "address_text": address_marker},
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
    # Advance it to ARRIVED via the real API so the test can immediately
    # exercise the "complete collection while offline" step, rather than
    # re-deriving the earlier status-progression flow already covered by
    # test_collector_flow.py.
    requests.patch(
        f"{API_BASE}/pickups/{pickup['id']}/status",
        headers={"Authorization": f"Bearer {collector_login['access_token']}"},
        json={"status": "EN_ROUTE"},
    )
    requests.patch(
        f"{API_BASE}/pickups/{pickup['id']}/status",
        headers={"Authorization": f"Bearer {collector_login['access_token']}"},
        json={"status": "ARRIVED"},
    )
    return pickup["id"]


def find_pickup_card(driver, address_marker: str):
    return driver.find_element(
        By.XPATH, f"//div[contains(@class,'rounded-lg') and .//p[contains(text(), '{address_marker}')]]"
    )


def test_collector_completes_collection_while_offline_and_it_syncs_on_reconnect(driver):
    address_marker = f"Offline Test Address {uuid.uuid4().hex[:8]}"
    pickup_id = setup_assigned_pickup(address_marker)

    driver.get(f"{FRONTEND_URL}/login")
    wait_for(driver, By.CSS_SELECTOR, "input[type=email]").send_keys("collector@ecotrack.dev")
    driver.find_element(By.CSS_SELECTOR, "input[type=password]").send_keys("EcoTrackDev123")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    wait_for_url_contains(driver, "/collector", timeout=10)

    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), address_marker))

    # --- Go offline (real app code path, simulated trigger — see module docstring) ---
    driver.execute_script(GO_OFFLINE_SCRIPT)
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "You're offline"))

    # --- Complete the collection while offline — this should queue locally, not fail ---
    card = find_pickup_card(driver, address_marker)
    card.find_element(By.XPATH, ".//button[contains(text(), 'Complete collection')]").click()

    weight_input = wait_for(driver, By.CSS_SELECTOR, "input[type=number]")
    weight_input.send_keys("6.4")
    driver.find_element(By.XPATH, "//button[contains(text(), 'Submit')]").click()

    # --- Confirm the real "Pending sync" badge appears on this specific pickup's card ---
    WebDriverWait(driver, 10).until(lambda d: "Pending sync" in find_pickup_card(d, address_marker).text)

    # --- Confirm the pickup is NOT yet actually completed server-side ---
    # (proves the queued action hasn't silently gone through some other path)
    server_state = requests.get(f"{API_BASE}/pickups/{pickup_id}",
                                 headers={"Authorization": f"Bearer {api_login('superadmin@ecotrack.dev', 'EcoTrackDev123')['access_token']}"}).json()
    assert server_state["status"] == "ARRIVED"

    # --- Go back online — the queue should auto-flush against the real API ---
    driver.execute_script(GO_ONLINE_SCRIPT)

    # --- Confirm the real COLLECTED state now shows in this pickup's own card ---
    WebDriverWait(driver, 15).until(lambda d: "COLLECTED" in find_pickup_card(d, address_marker).text)

    # --- Confirm the pending-sync badge is gone now that the sync succeeded ---
    assert "Pending sync" not in find_pickup_card(driver, address_marker).text

    # --- Confirm the real server-side state actually changed — not just the UI ---
    admin_token = api_login("superadmin@ecotrack.dev", "EcoTrackDev123")["access_token"]
    server_state = requests.get(
        f"{API_BASE}/pickups/{pickup_id}", headers={"Authorization": f"Bearer {admin_token}"}
    ).json()
    assert server_state["status"] == "COLLECTED"
