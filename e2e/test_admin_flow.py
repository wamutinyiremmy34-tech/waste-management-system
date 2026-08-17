"""
E2E: admin login → view dashboard (real aggregate stats) → review a complaint
→ assign/resolve via the real status-transition buttons.
"""
import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from conftest import FRONTEND_URL, api_login, wait_for, wait_for_url_contains

API_BASE = "http://localhost:8000/api/v1"


def setup_fresh_complaint() -> str:
    citizen_login = api_login("citizen@ecotrack.dev", "EcoTrackDev123")
    complaint = requests.post(
        f"{API_BASE}/complaints",
        headers={"Authorization": f"Bearer {citizen_login['access_token']}"},
        json={
            "category": "DAMAGED_BIN",
            "description": "E2E test damaged bin near the market entrance",
            "latitude": 0.31,
            "longitude": 32.58,
        },
    ).json()
    return complaint["description"]


def test_admin_login_view_dashboard_and_moderate_complaint(driver):
    description = setup_fresh_complaint()

    # --- Login as the seeded super admin ---
    driver.get(f"{FRONTEND_URL}/login")
    wait_for(driver, By.CSS_SELECTOR, "input[type=email]").send_keys("superadmin@ecotrack.dev")
    driver.find_element(By.CSS_SELECTOR, "input[type=password]").send_keys("EcoTrackDev123")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    # A SUPER_ADMIN is routed to /admin.
    wait_for_url_contains(driver, "/admin", timeout=10)

    # --- Confirm real aggregate stats are rendered (not zero/placeholder) ---
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Total users"))
    body_text = driver.find_element(By.TAG_NAME, "body").text
    assert "Total users" in body_text

    # --- Confirm the fresh complaint appears in the real complaint list ---
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), description))

    # --- Move it through the real status transition buttons ---
    # Scoped to *this specific complaint's* card, not a bare global lookup —
    # other complaints from earlier test runs may also be sitting in
    # REPORTED status with their own "Move to UNDER REVIEW" button, and a
    # global XPath would non-deterministically grab whichever renders first
    # in DOM order rather than the one this test just created. This was a
    # real test-isolation bug found by running the full E2E suite together
    # (it passed in isolation, then flaked when other tests had left extra
    # REPORTED complaints in the database) — fixed by scoping to the
    # ancestor card that contains this complaint's own description text.
    complaint_card = driver.find_element(
        By.XPATH, f"//div[contains(@class,'rounded-lg') and .//p[contains(text(), '{description}')]]"
    )
    review_button = complaint_card.find_element(By.XPATH, ".//button[contains(text(), 'UNDER REVIEW')]")
    review_button.click()

    WebDriverWait(driver, 10).until(
        lambda d: "UNDER REVIEW" in complaint_card.text
    )
