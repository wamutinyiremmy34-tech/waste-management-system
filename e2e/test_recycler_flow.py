"""
E2E: recycler login → log recycling activity via the real form (category
select, quantity, date, destination) → confirm the new record appears in
the real records list. Uses the seeded `recycler@ecotrack.dev` account.
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from conftest import FRONTEND_URL, wait_for, wait_for_url_contains


def test_recycler_login_and_log_recycling_activity(driver):
    # --- Login as the seeded recycler ---
    driver.get(f"{FRONTEND_URL}/login")
    wait_for(driver, By.CSS_SELECTOR, "input[type=email]").send_keys("recycler@ecotrack.dev")
    driver.find_element(By.CSS_SELECTOR, "input[type=password]").send_keys("EcoTrackDev123")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()

    # A RECYCLER is routed to /recycler.
    wait_for_url_contains(driver, "/recycler", timeout=10)

    # --- Confirm the real platform-wide impact stats render ---
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Diversion rate"))

    # --- Fill out and submit the "Log recycling activity" form ---
    category_select = wait_for(driver, By.CSS_SELECTOR, "form select")
    from selenium.webdriver.support.ui import Select

    Select(category_select).select_by_value("METAL")

    quantity_input = driver.find_element(By.CSS_SELECTOR, "input[type=number]")
    quantity_input.clear()
    quantity_input.send_keys("17.5")

    destination_inputs = driver.find_elements(By.CSS_SELECTOR, "form input:not([type])")
    destination_inputs[0].send_keys("E2E Test Scrap Yard")

    submit_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Record recycling activity')]")
    submit_button.click()

    # --- Confirm the new record shows up in the real records list ---
    WebDriverWait(driver, 10).until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "E2E Test Scrap Yard"))
    body_text = driver.find_element(By.TAG_NAME, "body").text
    assert "METAL" in body_text
    assert "17.5" in body_text
