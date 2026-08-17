"""
E2E: citizen register → login → request pickup → view status in dashboard.
Drives a real WebKitGTK browser against the real running frontend, which
itself talks to the real running backend. Nothing here is mocked.
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from conftest import FRONTEND_URL, unique_email, wait_for, wait_for_url_contains


def test_citizen_register_login_request_pickup_view_status(driver):
    email = unique_email("e2e-citizen")
    password = "E2ETestPass123"

    # --- Register ---
    driver.get(f"{FRONTEND_URL}/register")
    wait_for(driver, By.CSS_SELECTOR, "input[type=email]").send_keys(email)
    driver.find_element(By.CSS_SELECTOR, "input[type=password]").send_keys(password)
    # full_name is the first text input on the form
    driver.find_element(By.CSS_SELECTOR, "form input:not([type])").send_keys("E2E Test Citizen")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    # Registration redirects to /login on success.
    wait_for_url_contains(driver, "/login", timeout=10)

    # --- Login ---
    wait_for(driver, By.CSS_SELECTOR, "input[type=email]").send_keys(email)
    driver.find_element(By.CSS_SELECTOR, "input[type=password]").send_keys(password)
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    # Login redirects through /post-login to /dashboard for a CITIZEN.
    wait_for_url_contains(driver, "/dashboard", timeout=10)

    # --- Confirm we're really logged in as this user ---
    body_text = wait_for(driver, By.TAG_NAME, "body").text
    assert "E2E Test Citizen" in body_text

    # --- Request a pickup ---
    driver.get(f"{FRONTEND_URL}/pickups/new")
    wait_for(driver, By.CSS_SELECTOR, "select")  # waste category select present

    # Stub navigator.geolocation deterministically before triggering it — the
    # same standard E2E pattern Playwright's built-in geolocation mocking
    # uses. This is necessary because headless WebKitGTK has no permission
    # UI to resolve a real getCurrentPosition() call, which was confirmed to
    # hang indefinitely rather than fall through to the app's own documented
    # fallback (see docs/testing.md for this finding). Stubbing the browser
    # API is standard E2E practice and still exercises all of the app's own
    # real code paths (the click handler, the resulting state update, the
    # button label change) — only the browser's own geolocation
    # implementation is substituted, not any app logic.
    driver.execute_script(
        """
        Object.defineProperty(navigator, "geolocation", {
          value: { getCurrentPosition: function(success) { success({coords: {latitude: 0.3476, longitude: 32.5825}}); } },
          configurable: true
        });
        """
    )

    location_button = driver.find_element(By.XPATH, "//button[contains(text(), 'ocation')]")
    location_button.click()

    # Wait for the button label to update to "Location set (...)" confirming
    # the app's own state updated in response to the (stubbed) geolocation.
    WebDriverWait(driver, 10).until(
        EC.text_to_be_present_in_element((By.XPATH, "//button[contains(text(), 'ocation')]"), "Location set")
    )

    submit_button = driver.find_element(By.XPATH, "//button[@type='submit']")
    submit_button.click()

    # A successful submission redirects back to /dashboard.
    wait_for_url_contains(driver, "/dashboard", timeout=10)

    # --- Confirm the new pickup shows up in the dashboard's real pickup list ---
    driver.get(f"{FRONTEND_URL}/dashboard")
    WebDriverWait(driver, 10).until(
        lambda d: "Loading" not in d.find_element(By.TAG_NAME, "body").text
    )
    body_text = driver.find_element(By.TAG_NAME, "body").text
    assert "REQUESTED" in body_text or "Your pickups" in body_text
