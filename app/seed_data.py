import datetime
from app.database import get_db, init_db

def seed_database():
    init_db()
    with get_db() as conn:
        cursor = conn.cursor()

        # Check if users already seeded
        cursor.execute("SELECT COUNT(*) as cnt FROM users")
        if cursor.fetchone()["cnt"] > 0:
            print("Database already contains data. Skipping initial seeding.")
            return

        print("Seeding initial data...")

        # 1. Warehouses
        warehouses = [
            ("WH1", "Main Warehouse & Central Hub", "100 Industrial Parkway, North Gate"),
            ("WH2", "East Branch Distribution", "45 Logistics Blvd, Sector 7"),
            ("PRD", "Manufacturing & Assembly Facility", "12 Assembly Lane, Industrial Park")
        ]
        wh_ids = {}
        for code, name, addr in warehouses:
            cursor.execute(
                "INSERT INTO warehouses (code, name, address) VALUES (?, ?, ?)",
                (code, name, addr)
            )
            wh_ids[code] = cursor.lastrowid

        # 2. Locations
        # Virtual Locations
        cursor.execute("INSERT INTO locations (code, name, location_type) VALUES ('VEND', 'Vendor Location', 'vendor')")
        loc_vendor_id = cursor.lastrowid
        cursor.execute("INSERT INTO locations (code, name, location_type) VALUES ('CUST', 'Customer Location', 'customer')")
        loc_customer_id = cursor.lastrowid
        cursor.execute("INSERT INTO locations (code, name, location_type) VALUES ('LOSS', 'Inventory Loss / Scrap', 'inventory_loss')")
        loc_loss_id = cursor.lastrowid

        # Internal Locations
        locations = [
            (wh_ids["WH1"], "WH1/STORE", "Main Store", "internal"),
            (wh_ids["WH1"], "WH1/RACK-A", "Rack A", "internal"),
            (wh_ids["WH1"], "WH1/RACK-B", "Rack B", "internal"),
            (wh_ids["PRD"], "PRD/FLOOR", "Production Floor (Rack)", "internal"),
            (wh_ids["WH2"], "WH2/STORAGE", "East Storage Bay", "internal"),
        ]
        loc_ids = {}
        for wh_id, code, name, ltype in locations:
            cursor.execute(
                "INSERT INTO locations (warehouse_id, code, name, location_type) VALUES (?, ?, ?, ?)",
                (wh_id, code, name, ltype)
            )
            loc_ids[code] = cursor.lastrowid

        # 3. Users
        users = [
            ("Praveen Kumar", "manager@stocksense.com", "admin123", "Inventory Manager", wh_ids["WH1"]),
            ("Alex Rivera", "staff@stocksense.com", "staff123", "Warehouse Staff", wh_ids["WH1"])
        ]
        user_ids = {}
        for name, email, pwd, role, wh_id in users:
            cursor.execute(
                "INSERT INTO users (name, email, password, role, assigned_warehouse_id) VALUES (?, ?, ?, ?, ?)",
                (name, email, pwd, role, wh_id)
            )
            user_ids[email] = cursor.lastrowid

        # 4. Categories
        categories = [
            ("Raw Materials", "Base materials for manufacturing and construction", "#714B67"),
            ("Finished Goods", "Fully assembled ready-for-sale products", "#017E84"),
            ("Hardware & Fasteners", "Nuts, bolts, fixtures, and fittings", "#D97706"),
            ("Furniture", "Commercial and office furniture", "#2563EB")
        ]
        cat_ids = {}
        for name, desc, color in categories:
            cursor.execute(
                "INSERT INTO categories (name, description, color) VALUES (?, ?, ?)",
                (name, desc, color)
            )
            cat_ids[name] = cursor.lastrowid

        # 5. Partners
        partners = [
            ("Tata Steel Ltd", "supplier", "sales@tatasteel.com", "+91-9876543210", "Industrial Area, Jamshedpur"),
            ("Apex Hardware Suppliers", "supplier", "order@apexhardware.com", "+1-800-555-0199", "700 Fastener Ave, Chicago"),
            ("Global Timber & Wood", "supplier", "contact@globaltimber.com", "+1-800-555-0144", "44 Forest Way, Seattle"),
            ("Acme Industrial Corp", "customer", "procure@acme.com", "+1-800-555-0122", "88 Metropolis St, NY"),
            ("Metro Office Solutions", "customer", "buy@metrooffice.com", "+1-800-555-0133", "250 Commercial Center, LA"),
            ("Zenith Constructions", "customer", "orders@zenithconst.com", "+1-800-555-0188", "12 Skyline Blvd, Austin")
        ]
        for name, ptype, email, phone, addr in partners:
            cursor.execute(
                "INSERT INTO partners (name, partner_type, email, phone, address) VALUES (?, ?, ?, ?, ?)",
                (name, ptype, email, phone, addr)
            )

        # 6. Products
        # Note the exact items from the problem statement:
        # "Steel Rods", "Office Chair" / "chairs", "Steel" (kg)
        products = [
            ("Steel Rods", "STL-ROD-01", cat_ids["Raw Materials"], "Units", 15.0, 25.0, 20.0, 150.0, 50.0, "BAR-STL-001", "Heavy structural steel rods (12mm x 6m)"),
            ("Steel", "RAW-STL-100", cat_ids["Raw Materials"], "kg", 2.5, 4.2, 50.0, 500.0, 100.0, "BAR-STL-100", "Industrial grade rolled sheet steel"),
            ("Office Chair", "CHR-OFF-10", cat_ids["Furniture"], "Units", 45.0, 89.0, 10.0, 60.0, 15.0, "BAR-CHR-010", "Ergonomic mesh swivel office chair with lumbar support"),
            ("Steel Frame Sub-assembly", "FRM-STL-20", cat_ids["Finished Goods"], "Units", 30.0, 65.0, 10.0, 80.0, 20.0, "BAR-FRM-020", "Welded steel frame for modular workstations"),
            ("Heavy Duty Bolt M12", "BLT-HD-12", cat_ids["Hardware & Fasteners"], "Units", 0.8, 1.5, 100.0, 1000.0, 200.0, "BAR-BLT-012", "Grade 8.8 hex bolt M12 x 50mm with lock washer"),
            ("Plywood Sheet 18mm", "PLY-18-SHT", cat_ids["Raw Materials"], "Units", 22.0, 38.0, 15.0, 100.0, 30.0, "BAR-PLY-018", "Hardwood marine grade plywood 8ft x 4ft")
        ]
        prod_ids = {}
        for name, sku, cid, uom, cost, sale, min_s, max_s, reorder, bar, desc in products:
            cursor.execute("""
                INSERT INTO products (name, sku, category_id, uom, cost_price, sale_price, min_stock, max_stock, reorder_qty, barcode, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, sku, cid, uom, cost, sale, min_s, max_s, reorder, bar, desc))
            prod_ids[sku] = cursor.lastrowid

            # Add reordering rule
            cursor.execute("""
                INSERT INTO reordering_rules (product_id, warehouse_id, location_id, min_quantity, max_quantity, reorder_quantity)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (prod_ids[sku], wh_ids["WH1"], loc_ids["WH1/STORE"], min_s, max_s, reorder))

        # 7. Initial Stock in Quants & initial stock ledger
        # Plywood: 6 units (below min of 15 -> Low stock alert!)
        # Office Chair: 35 units in WH1/STORE
        # Steel Rods: 50 units in WH1/RACK-A
        # Bolts: 450 units in WH1/RACK-B
        initial_stocks = [
            (prod_ids["CHR-OFF-10"], loc_ids["WH1/STORE"], 35.0, "Initial inventory intake for chairs"),
            (prod_ids["STL-ROD-01"], loc_ids["WH1/RACK-A"], 50.0, "Initial stock of steel rods"),
            (prod_ids["BLT-HD-12"], loc_ids["WH1/RACK-B"], 450.0, "Initial batch of hardware bolts"),
            (prod_ids["PLY-18-SHT"], loc_ids["WH1/STORE"], 6.0, "Low stock demo: only 6 sheets remaining"),
            (prod_ids["FRM-STL-20"], loc_ids["WH1/STORE"], 12.0, "Assembled frames ready in store")
        ]

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        for pid, lid, qty, note in initial_stocks:
            cursor.execute("""
                INSERT INTO stock_quants (product_id, location_id, quantity, updated_at)
                VALUES (?, ?, ?, ?)
            """, (pid, lid, qty, now_str))

            cursor.execute("""
                INSERT INTO stock_ledger (reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
                VALUES ('INIT/2026/0001', 'receipt', ?, ?, ?, ?, 'System Admin', ?, ?)
            """, (pid, loc_vendor_id, lid, qty, note, now_str))

        # 8. Seed sample active operations for each document type to populate Dashboard
        # Pending Receipt
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, created_by)
            VALUES ('REC/2026/0001', 'receipt', 'Ready', 'Tata Steel Ltd', ?, ?, ?, ?, 'Incoming raw materials shipment', ?)
        """, (loc_vendor_id, loc_ids["WH1/STORE"], wh_ids["WH1"], "2026-09-27", user_ids["manager@stocksense.com"]))
        rec_op_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty, unit_price)
            VALUES (?, ?, 50.0, 0.0, 15.0)
        """, (rec_op_id, prod_ids["STL-ROD-01"]))

        # Pending Delivery
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, created_by)
            VALUES ('DEL/2026/0001', 'delivery', 'Waiting', 'Metro Office Solutions', ?, ?, ?, ?, 'Order for commercial furniture setup', ?)
        """, (loc_ids["WH1/STORE"], loc_customer_id, wh_ids["WH1"], "2026-09-28", user_ids["staff@stocksense.com"]))
        del_op_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty, unit_price)
            VALUES (?, ?, 10.0, 0.0, 89.0)
        """, (del_op_id, prod_ids["CHR-OFF-10"]))

        # Scheduled Internal Transfer
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, created_by)
            VALUES ('INT/2026/0001', 'internal', 'Ready', 'Internal Production', ?, ?, ?, ?, 'Transfer parts for assembly lines', ?)
        """, (loc_ids["WH1/RACK-B"], loc_ids["PRD/FLOOR"], wh_ids["WH1"], "2026-09-26", user_ids["manager@stocksense.com"]))
        int_op_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty, unit_price)
            VALUES (?, ?, 100.0, 0.0, 0.8)
        """, (int_op_id, prod_ids["BLT-HD-12"]))

        print("Database seeded successfully with users, products, warehouses, and sample operations!")

if __name__ == "__main__":
    seed_database()
