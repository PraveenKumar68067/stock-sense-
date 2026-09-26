import os
import sys
import time
import subprocess
from playwright.sync_api import sync_playwright

if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding="utf-8")

RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

FFMPEG_PATH = r"C:\Users\parve\AppData\Local\ms-playwright\ffmpeg-1011\ffmpeg-win64.exe"

def run_recording():
    print("=" * 60)
    print("🎬 Starting StockSense Video Recording Walkthrough...")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
                "--window-size=1920,1080"
            ]
        )

        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=RECORDINGS_DIR,
            record_video_size={"width": 1920, "height": 1080}
        )

        page = context.new_page()

        def smooth_scroll(y_target, steps=8, delay=0.08):
            current_y = page.evaluate("() => document.getElementById('view-container')?.scrollTop || window.scrollY")
            step_size = (y_target - current_y) / steps
            for i in range(steps):
                current_y += step_size
                page.evaluate(f"() => {{ const el = document.getElementById('view-container'); if(el) el.scrollTop = {current_y}; else window.scrollTo(0, {current_y}); }}")
                page.wait_for_timeout(int(delay * 1000))

        # -------------------------------------------------------------
        # Scene 1: Dashboard Overview & KPIs
        # -------------------------------------------------------------
        print("📹 Scene 1: Landing on StockSense Dashboard...")
        page.goto("http://127.0.0.1:8000/", wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Highlight user profile Praveen Kumar
        page.hover(".user-card")
        page.wait_for_timeout(1000)

        # Hover over KPI Cards
        kpi_cards = page.query_selector_all(".kpi-card")
        for card in kpi_cards[:5]:
            card.hover()
            page.wait_for_timeout(700)

        # Dynamic Filters on Dashboard
        page.locator(".filter-pill", has_text="Receipts").click()
        page.wait_for_timeout(1200)

        page.locator(".filter-pill", has_text="Delivery").click()
        page.wait_for_timeout(1200)

        page.locator(".filter-pill", has_text="All").first.click()
        page.wait_for_timeout(1000)

        smooth_scroll(350)
        page.wait_for_timeout(1500)
        smooth_scroll(0)
        page.wait_for_timeout(800)

        # -------------------------------------------------------------
        # Scene 2: Interactive 4-Step Scenario Walkthrough
        # -------------------------------------------------------------
        print("📹 Scene 2: Launching Problem Statement 4-Step Scenario...")
        page.click("button:has-text('Walkthrough')")
        page.wait_for_timeout(1500)

        # Click Run All 4 Steps Now
        print("   Running 4-Step Scenario (Receipt ➔ Transfer ➔ Delivery ➔ Adjustment)...")
        page.click("#btn-run-scenario")
        page.wait_for_timeout(3500)

        # -------------------------------------------------------------
        # Scene 3: Product Management & Stock Availability per Location
        # -------------------------------------------------------------
        print("📹 Scene 3: Navigating to Products & Stock Catalog...")
        page.click(".nav-item[data-view='products']")
        page.wait_for_timeout(2000)

        smooth_scroll(250)
        page.wait_for_timeout(1200)

        # Filter Stock Status (Low stock)
        status_sel = page.query_selector("#product-status-filter")
        if status_sel:
            status_sel.select_option("low_stock")
            page.wait_for_timeout(1500)
            status_sel.select_option("all")
            page.wait_for_timeout(1200)

        # Open Low Stock Alerts
        page.click("button:has-text('Low Stock Alerts')")
        page.wait_for_timeout(2000)
        page.click(".modal-close")
        page.wait_for_timeout(800)

        # Open Create Product Modal
        page.click("button:has-text('Create Product')")
        page.wait_for_timeout(1500)
        page.fill("#p-name", "High Precision Steel Bearing")
        page.wait_for_timeout(500)
        page.fill("#p-sku", "BRG-STL-099")
        page.wait_for_timeout(500)
        page.click(".modal-close")
        page.wait_for_timeout(800)

        smooth_scroll(0)

        # -------------------------------------------------------------
        # Scene 4: Receipts (Incoming Goods)
        # -------------------------------------------------------------
        print("📹 Scene 4: Receipts (Incoming Stock) Workflow...")
        page.click(".nav-item[data-view='receipts']")
        page.wait_for_timeout(2000)

        # View details of first receipt
        detail_btns = page.query_selector_all("button:has-text('Details')")
        if detail_btns:
            detail_btns[0].click()
            page.wait_for_timeout(2000)
            page.click(".modal-close")
            page.wait_for_timeout(800)

        # -------------------------------------------------------------
        # Scene 5: Delivery Orders (Outgoing Goods)
        # -------------------------------------------------------------
        print("📹 Scene 5: Delivery Orders (Outgoing Goods) 3-Step Process...")
        page.click(".nav-item[data-view='deliveries']")
        page.wait_for_timeout(2000)

        # Inspect Delivery
        del_details = page.query_selector_all("button:has-text('Details')")
        if del_details:
            del_details[0].click()
            page.wait_for_timeout(2000)
            page.click(".modal-close")
            page.wait_for_timeout(800)

        # -------------------------------------------------------------
        # Scene 6: Internal Transfers
        # -------------------------------------------------------------
        print("📹 Scene 6: Internal Transfers & Rapid Transfer Bar...")
        page.click(".nav-item[data-view='transfers']")
        page.wait_for_timeout(2000)

        # Select product in rapid transfer bar
        page.select_option("#qt-product", index=1)
        page.wait_for_timeout(1000)
        page.fill("#qt-qty", "10")
        page.wait_for_timeout(800)
        page.click("button:has-text('Transfer Now')")
        page.wait_for_timeout(2000)

        # -------------------------------------------------------------
        # Scene 7: Stock Adjustments (Physical Count vs Recorded)
        # -------------------------------------------------------------
        print("📹 Scene 7: Stock Adjustments (Physical Counting)...")
        page.click(".nav-item[data-view='adjustments']")
        page.wait_for_timeout(2000)

        # Open Count Modal
        page.click("button:has-text('Record New Count')")
        page.wait_for_timeout(1200)
        page.select_option("#adj-product", index=1)
        page.wait_for_timeout(800)
        page.fill("#adj-counted", "45")
        page.wait_for_timeout(800)
        page.fill("#adj-reason", "Annual physical stock verification")
        page.wait_for_timeout(800)
        page.click("button:has-text('Apply Stock Adjustment')")
        page.wait_for_timeout(2000)

        # -------------------------------------------------------------
        # Scene 8: Move History & Stock Ledger (Immutable Audit Trail)
        # -------------------------------------------------------------
        print("📹 Scene 8: Stock Ledger (Immutable Audit Trail)...")
        page.click(".nav-item[data-view='ledger']")
        page.wait_for_timeout(2000)

        smooth_scroll(300)
        page.wait_for_timeout(1500)
        smooth_scroll(0)

        # Export CSV demonstration
        page.click("button:has-text('Export to CSV')")
        page.wait_for_timeout(1500)

        # -------------------------------------------------------------
        # Scene 9: Multi-Warehouse & Location Architecture
        # -------------------------------------------------------------
        print("📹 Scene 9: Multi-Warehouse & Locations Settings...")
        page.click(".nav-item[data-view='settings']")
        page.wait_for_timeout(2000)

        smooth_scroll(250)
        page.wait_for_timeout(1500)
        smooth_scroll(0)

        # -------------------------------------------------------------
        # Scene 10: User Profile & OTP Reset (Praveen Kumar)
        # -------------------------------------------------------------
        print("📹 Scene 10: User Profile & OTP Reset (Praveen Kumar)...")
        page.click(".user-card")
        page.wait_for_timeout(1500)

        page.click("button:has-text('Request OTP Password Reset')")
        page.wait_for_timeout(1200)

        page.click("button:has-text('Send OTP Code')")
        page.wait_for_timeout(2000)

        # Copy generated OTP code
        otp_text = page.inner_text("#otp-simulation-alert")
        print(f"   {otp_text}")
        page.wait_for_timeout(1500)
        page.click(".modal-close")
        page.wait_for_timeout(800)

        # -------------------------------------------------------------
        # Scene 11: Return to Dashboard (Final Overview)
        # -------------------------------------------------------------
        print("📹 Scene 11: Return to Live Dashboard...")
        page.click(".nav-item[data-view='dashboard']")
        page.wait_for_timeout(3000)

        # Final pause
        print("Finishing recording session...")
        page.wait_for_timeout(2000)

        # Close context and browser to finalize video
        video_path = page.video.path()
        context.close()
        browser.close()

        print(f"✓ Raw video captured at: {video_path}")

        # Rename / convert to high quality MP4
        output_webm = os.path.join(RECORDINGS_DIR, "StockSense_Demo_Walkthrough.webm")
        output_mp4 = os.path.join(RECORDINGS_DIR, "StockSense_Demo_Walkthrough.mp4")

        if os.path.exists(output_webm):
            try:
                os.remove(output_webm)
            except Exception:
                pass

        os.rename(video_path, output_webm)
        print(f"✓ Saved WebM video to: {output_webm}")

        # Convert to MP4 using Playwright's bundled FFmpeg
        if os.path.exists(FFMPEG_PATH):
            print("🎬 Converting video to MP4 format with FFmpeg...")
            cmd = [
                FFMPEG_PATH, "-y",
                "-i", output_webm,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "22",
                "-pix_fmt", "yuv420p",
                output_mp4
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0:
                print(f"🎉 Successfully generated MP4 video: {output_mp4}")
            else:
                print(f"FFmpeg notice: {res.stderr[:200]}")
        else:
            print("FFmpeg binary not found at default location; WebM video is ready.")

        print("\n" + "=" * 60)
        print("🎉 Video recording completed successfully!")
        print(f"📁 WebM Video: {output_webm}")
        if os.path.exists(output_mp4):
            print(f"📁 MP4 Video:  {output_mp4}")
        print("=" * 60)

if __name__ == "__main__":
    run_recording()
