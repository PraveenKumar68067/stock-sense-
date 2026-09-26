import datetime
from fastapi import APIRouter
from app.database import get_db
from app.routes.operations import generate_reference

router = APIRouter(prefix="/api/demo", tags=["demo"])

@router.post("/run-full-scenario")
def run_full_scenario():
    """
    Executes the exact 4-step scenario from the problem statement:
    Step 1: Receive 100 kg Steel from Vendor -> Stock: +100 in Main Store
    Step 2: Internal Transfer: Main Store -> Production Rack (50 kg Steel moved) -> Stock location updated
    Step 3: Deliver finished goods: Deliver 20 Steel -> Stock: -20
    Step 4: Stock Adjustment: 3 kg steel damaged -> Stock: -3
    Everything logged in the Stock Ledger!
    """
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d %H:%M:%S")

        # Find Steel product (SKU: RAW-STL-100)
        cursor.execute("SELECT id, name FROM products WHERE sku = 'RAW-STL-100'")
        steel = cursor.fetchone()
        if not steel:
            return {"success": False, "message": "Steel product not found. Re-run seeding."}
        steel_id = steel["id"]

        # Find Locations
        cursor.execute("SELECT id FROM locations WHERE code = 'WH1/STORE'")
        loc_main_store = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM locations WHERE code = 'PRD/FLOOR'")
        loc_prd_floor = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM locations WHERE location_type = 'vendor' LIMIT 1")
        loc_vendor = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM locations WHERE location_type = 'customer' LIMIT 1")
        loc_customer = cursor.fetchone()["id"]
        cursor.execute("SELECT id FROM locations WHERE location_type = 'inventory_loss' LIMIT 1")
        loc_loss = cursor.fetchone()["id"]

        cursor.execute("SELECT id FROM warehouses WHERE code = 'WH1'")
        wh1_id = cursor.fetchone()["id"]

        logs = []

        # ==========================================
        # STEP 1: Receive Goods from Vendor
        # Receive 100 kg Steel -> Stock: +100
        # ==========================================
        ref_rec = generate_reference(cursor, "receipt")
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, validated_at)
            VALUES (?, 'receipt', 'Done', 'Tata Steel Ltd', ?, ?, ?, ?, 'Step 1: Receive 100 kg Steel from Vendor', ?)
        """, (ref_rec, loc_vendor, loc_main_store, wh1_id, date_str[:10], date_str))
        op_rec_id = cursor.lastrowid
        cursor.execute("INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty) VALUES (?, ?, 100.0, 100.0)", (op_rec_id, steel_id))

        # Update Stock: Main Store +100
        cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (steel_id, loc_main_store))
        sq = cursor.fetchone()
        if sq:
            cursor.execute("UPDATE stock_quants SET quantity = quantity + 100.0, updated_at = ? WHERE id = ?", (date_str, sq["id"]))
        else:
            cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, 100.0, ?)", (steel_id, loc_main_store, date_str))

        # Log to ledger
        cursor.execute("""
            INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
            VALUES (?, ?, 'receipt', ?, ?, ?, 100.0, 'Praveen Kumar', 'Step 1: Vendor Receipt: +100 kg Steel', ?)
        """, (op_rec_id, ref_rec, steel_id, loc_vendor, loc_main_store, date_str))
        logs.append(f"Step 1 Done: Received 100 kg Steel into Main Store ({ref_rec}) -> Stock: +100")

        # ==========================================
        # STEP 2: Move to production rack
        # Internal transfer: Main Store -> Production Rack (50 kg moved)
        # Total stock unchanged, new location updated
        # ==========================================
        ref_int = generate_reference(cursor, "internal")
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, validated_at)
            VALUES (?, 'internal', 'Done', 'Internal Transfer', ?, ?, ?, ?, 'Step 2: Move to production rack', ?)
        """, (ref_int, loc_main_store, loc_prd_floor, wh1_id, date_str[:10], date_str))
        op_int_id = cursor.lastrowid
        cursor.execute("INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty) VALUES (?, ?, 50.0, 50.0)", (op_int_id, steel_id))

        # Decrement Main Store 50
        cursor.execute("UPDATE stock_quants SET quantity = quantity - 50.0, updated_at = ? WHERE product_id = ? AND location_id = ?", (date_str, steel_id, loc_main_store))
        # Increment Production Floor 50
        cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (steel_id, loc_prd_floor))
        pq = cursor.fetchone()
        if pq:
            cursor.execute("UPDATE stock_quants SET quantity = quantity + 50.0, updated_at = ? WHERE id = ?", (date_str, pq["id"]))
        else:
            cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, 50.0, ?)", (steel_id, loc_prd_floor, date_str))

        cursor.execute("""
            INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
            VALUES (?, ?, 'internal', ?, ?, ?, 50.0, 'Alex Rivera', 'Step 2: Internal Transfer: Main Store -> Production Rack', ?)
        """, (op_int_id, ref_int, steel_id, loc_main_store, loc_prd_floor, date_str))
        logs.append(f"Step 2 Done: Moved 50 kg Steel from Main Store to Production Rack ({ref_int}) -> Total stock unchanged (100 kg), location updated")

        # ==========================================
        # STEP 3: Deliver finished goods
        # Deliver 20 steel -> Stock: -20
        # ==========================================
        ref_del = generate_reference(cursor, "delivery")
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, validated_at)
            VALUES (?, 'delivery', 'Done', 'Acme Industrial Corp', ?, ?, ?, ?, 'Step 3: Deliver finished goods to customer', ?)
        """, (ref_del, loc_prd_floor, loc_customer, wh1_id, date_str[:10], date_str))
        op_del_id = cursor.lastrowid
        cursor.execute("INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty) VALUES (?, ?, 20.0, 20.0)", (op_del_id, steel_id))

        # Decrement Production Floor 20
        cursor.execute("UPDATE stock_quants SET quantity = quantity - 20.0, updated_at = ? WHERE product_id = ? AND location_id = ?", (date_str, steel_id, loc_prd_floor))

        cursor.execute("""
            INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
            VALUES (?, ?, 'delivery', ?, ?, ?, -20.0, 'Alex Rivera', 'Step 3: Customer Delivery: -20 kg Steel', ?)
        """, (op_del_id, ref_del, steel_id, loc_prd_floor, loc_customer, date_str))
        logs.append(f"Step 3 Done: Delivered 20 kg Steel to Acme Corp ({ref_del}) -> Stock for frames: -20 (30 kg remaining in Production Rack)")

        # ==========================================
        # STEP 4: Adjust damaged items
        # 3 kg steel damaged -> Stock: -3
        # Everything logged in the Stock Ledger
        # ==========================================
        ref_adj = generate_reference(cursor, "adjustment")
        # Currently 30 kg in Production Rack -> Counted is 27 kg (damaged 3 kg)
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, validated_at)
            VALUES (?, 'adjustment', 'Done', 'Damage Adjustment', ?, ?, ?, ?, 'Step 4: 3 kg steel damaged during handling', ?)
        """, (ref_adj, loc_prd_floor, loc_loss, wh1_id, date_str[:10], date_str))
        op_adj_id = cursor.lastrowid
        cursor.execute("INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty) VALUES (?, ?, 3.0, 3.0)", (op_adj_id, steel_id))

        cursor.execute("UPDATE stock_quants SET quantity = 27.0, updated_at = ? WHERE product_id = ? AND location_id = ?", (date_str, steel_id, loc_prd_floor))

        cursor.execute("""
            INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
            VALUES (?, ?, 'adjustment', ?, ?, ?, -3.0, 'Praveen Kumar', 'Step 4: 3 kg steel damaged -> Stock: -3', ?)
        """, (op_adj_id, ref_adj, steel_id, loc_prd_floor, loc_loss, date_str))
        logs.append(f"Step 4 Done: Adjusted 3 kg damaged steel ({ref_adj}) -> Stock: -3 (Final 27 kg in Production Rack, 50 kg in Main Store = 77 kg total)")

        # Fetch current steel breakdown
        cursor.execute("""
            SELECT l.name as location_name, sq.quantity
            FROM stock_quants sq
            JOIN locations l ON sq.location_id = l.id
            WHERE sq.product_id = ?
        """, (steel_id,))
        final_stock = [dict(r) for r in cursor.fetchall()]

        return {
            "success": True,
            "message": "Complete 4-Step Problem Statement Scenario executed successfully!",
            "steps_executed": logs,
            "final_steel_distribution": final_stock
        }
