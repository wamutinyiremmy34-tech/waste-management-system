"""
E2E: organization admin login → view real waste analytics → add a new
location via the real form (including a stubbed geolocation call, same
pattern as test_citizen_flow.py) → confirm it appears.
"""
import uuid

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from conftest import FRONTEND_URL, wait_for, wait_for_url_contains

GEOLOCATION_STUB = """
Object.defineProperty(navigator, "geolocation", {
  value: { getCurrentPosition: function(success) { success({coords: {latitude: 0.3476, longitude: 32.5825}}); } },
  configurable: true
});
"""


def test_organization_admin_login_view_analytics_and_add_location(driver):
    label = f"E2E Test Location {uuid.uuid4().hex[:8]}"

    # --- Login as the seeded organization admin ---
    driver.get(f"{FRONTEND_URL}/login")
    wait_for(driver, By.CSS_SELECTOR, "input[type=email]").send_keys("orgadmin@ecotrack.dev")
    driver.find_element(By.CSS_SELECTOR, "input[type=password]").send_keys("EcoTrackDev123")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    # An ORGANIZATION_ADMIN is routed to /organization.
    wait_for_url_contains(driver, "/organization", timeout=10)

    # --- Confirm the real organization name and waste analytics render ---
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Total waste recorded"))

    # --- Open the "Add location" form ---
    add_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Add location')]")
    add_button.click()

    label_input = wait_for(driver, By.XPATH, "//input[@placeholder='e.g. Main campus, Branch office']")
    label_input.send_keys(label)

    # Stub geolocation before triggering it, same reasoning as
    # test_citizen_flow.py — headless WebKitGTK has no permission UI and
    # hangs indefinitely on a real getCurrentPosition() call.
    driver.execute_script(GEOLOCATION_STUB)

    location_button = driver.find_element(By.XPATH, "//button[contains(text(), 'current location')]")
    location_button.click()
    # Note: after the click, the button's own text changes to "Location set
    # (...)" and no longer matches the XPath used to find it originally, so
    # wait on the page body rather than re-locating the same element by its
    # old text — a real bug in an earlier version of this test, not the app
    # (confirmed by reproducing the click step-by-step outside pytest first).
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Location set"))

    save_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Save location')]")
    save_button.click()

    # --- Confirm the real success message names the location we just added ---
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), label))
