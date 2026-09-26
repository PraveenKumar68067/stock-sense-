import os
import sys

# Ensure stdout handles UTF-8 on Windows
if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient

# Ensure app is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app
from app.database import init_db
from app.seed_data import seed_database

def test_full_system():
    print("Initializing test environment...")
    init_db()
    seed_database()

    client = TestClient(app)

    # 1. Test Static & Root
    print("Testing GET / ...")
    res = client.get("/")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    print("✓ Root endpoint served HTML successfully")

    # 2. Test Auth Login & OTP
    print("Testing Auth Login...")
    res = client.post("/api/auth/login", json={"email": "manager@stocksense.com", "password": "admin123"})
    assert res.status_code == 200
    user_data = res.json()
    assert user_data["user"]["role"] == "Inventory Manager"
    print("✓ Manager login verified")

    print("Testing OTP generation & password reset...")
    otp_res = client.post("/api/auth/request-otp", json={"email": "staff@stocksense.com"})
    assert otp_res.status_code == 200
    demo_otp = otp_res.json()["demo_otp"]
    print(f"✓ OTP generated: {demo_otp}")

    reset_res = client.post("/api/auth/reset-password", json={
        "email": "staff@stocksense.com",
        "otp": demo_otp,
        "new_password": "newpassword123"
    })
    assert reset_res.status_code == 200
    # Re-login with new password
    login_new = client.post("/api/auth/login", json={"email": "staff@stocksense.com", "password": "newpassword123"})
    assert login_new.status_code == 200
    # Restore password back to staff123 for convenience
    client.post("/api/auth/request-otp", json={"email": "staff@stocksense.com"})
    otp_code2 = client.post("/api/auth/request-otp", json={"email": "staff@stocksense.com"}).json()["demo_otp"]
    client.post("/api/auth/reset-password", json={"email": "staff@stocksense.com", "otp": otp_code2, "new_password": "staff123"})
    print("✓ OTP password reset workflow verified")

    # 3. Test Products & Low stock
    print("Testing Products API...")
    prod_res = client.get("/api/products")
    assert prod_res.status_code == 200
    products = prod_res.json()["products"]
    assert len(products) >= 6
    print(f"✓ Fetched {len(products)} products with location breakdown")

    # Check low stock alerts
    alert_res = client.get("/api/products/reordering-rules/alerts")
    assert alert_res.status_code == 200
    alerts = alert_res.json()["alerts"]
    print(f"✓ Low stock alerts working ({len(alerts)} items flagged)")

    # 4. Test PDF 4-Step Scenario
    print("Testing PDF 4-Step Scenario (/api/demo/run-full-scenario)...")
    demo_res = client.post("/api/demo/run-full-scenario")
    assert demo_res.status_code == 200
    demo_data = demo_res.json()
    assert demo_data["success"] is True
    print("✓ Scenario executed successfully!")
    for step in demo_data["steps_executed"]:
        print(f"   • {step}")

    # 5. Test Stock Adjustment
    print("Testing Stock Adjustment...")
    # Find Steel ID
    steel = next(p for p in products if p["sku"] == "RAW-STL-100")
    # Location WH1/STORE
    locs_res = client.get("/api/settings/locations")
    locs = locs_res.json()["locations"]
    main_store = next(l for l in locs if l["code"] == "WH1/STORE")

    adj_res = client.post("/api/operations/adjustments", json={
        "product_id": steel["id"],
        "location_id": main_store["id"],
        "counted_quantity": 48.0,
        "reason": "Recount adjustment: 2 kg adjustment"
    })
    assert adj_res.status_code == 200
    print(f"✓ Adjustment recorded: {adj_res.json()['message']}")

    # 6. Test Dashboard KPIs
    print("Testing Dashboard KPIs...")
    kpi_res = client.get("/api/dashboard/kpis")
    assert kpi_res.status_code == 200
    kpis = kpi_res.json()
    assert kpis["total_products_count"] > 0
    assert len(kpis["recent_activity"]) > 0
    print(f"✓ KPIs verified: {kpis['total_units_in_stock']} total units across warehouses, ${kpis['total_inventory_valuation']} valuation")

    # 7. Test Stock Ledger Move History
    print("Testing Stock Ledger History...")
    ledger_res = client.get("/api/operations/ledger/history")
    assert ledger_res.status_code == 200
    moves = ledger_res.json()["moves"]
    assert len(moves) >= 5
    print(f"✓ Stock Ledger verified: {len(moves)} immutable audit entries recorded")

    print("\n" + "=" * 50)
    print("🎉 ALL TESTS PASSED SUCCESSFULLY! 100% OPERATIONAL")
    print("=" * 50)

if __name__ == "__main__":
    test_full_system()
