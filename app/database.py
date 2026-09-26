import sqlite3
import os
from contextlib import contextmanager

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(DB_DIR, "stocksense.db")

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()

        # Users table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Warehouse Staff', -- 'Inventory Manager' or 'Warehouse Staff'
            assigned_warehouse_id INTEGER,
            otp_code TEXT,
            otp_expires_at TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Categories table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            color TEXT DEFAULT '#714B67',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Warehouses table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS warehouses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Locations table (can belong to warehouse, or be virtual like Vendor/Customer/Loss)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warehouse_id INTEGER,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            location_type TEXT NOT NULL DEFAULT 'internal', -- 'internal', 'vendor', 'customer', 'inventory_loss'
            parent_id INTEGER,
            FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
            FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE SET NULL
        );
        """)

        # Products table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sku TEXT UNIQUE NOT NULL,
            category_id INTEGER,
            uom TEXT NOT NULL DEFAULT 'Units', -- Unit of Measure (Units, kg, m, boxes, etc.)
            cost_price REAL DEFAULT 0.0,
            sale_price REAL DEFAULT 0.0,
            min_stock REAL DEFAULT 10.0, -- Reordering rule
            max_stock REAL DEFAULT 100.0,
            reorder_qty REAL DEFAULT 20.0,
            barcode TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );
        """)

        # Stock Quants (stock on hand per product per location)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_quants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            location_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 0.0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(product_id, location_id),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
        );
        """)

        # Operations / Stock Transfers (Receipts, Deliveries, Internal Transfers, Adjustments)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT UNIQUE NOT NULL, -- e.g. REC/2026/0001, DEL/2026/0001, INT/2026/0001, ADJ/2026/0001
            op_type TEXT NOT NULL, -- 'receipt', 'delivery', 'internal', 'adjustment'
            status TEXT NOT NULL DEFAULT 'Draft', -- 'Draft', 'Waiting', 'Ready', 'Done', 'Canceled'
            partner_name TEXT, -- Supplier or Customer name
            source_location_id INTEGER,
            dest_location_id INTEGER,
            warehouse_id INTEGER,
            scheduled_date TEXT,
            notes TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            validated_at DATETIME,
            FOREIGN KEY (source_location_id) REFERENCES locations(id),
            FOREIGN KEY (dest_location_id) REFERENCES locations(id),
            FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );
        """)

        # Operation Lines (items within a receipt, delivery, transfer, adjustment)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS operation_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            demanded_qty REAL NOT NULL DEFAULT 1.0,
            done_qty REAL NOT NULL DEFAULT 0.0,
            unit_price REAL DEFAULT 0.0,
            FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        """)

        # Stock Moves / Stock Ledger (Immutable audit log of all validated stock moves)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id INTEGER,
            reference TEXT NOT NULL,
            op_type TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            source_location_id INTEGER NOT NULL,
            dest_location_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            user_name TEXT,
            notes TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE SET NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (source_location_id) REFERENCES locations(id),
            FOREIGN KEY (dest_location_id) REFERENCES locations(id)
        );
        """)

        # Reordering Rules (detailed)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS reordering_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            warehouse_id INTEGER,
            location_id INTEGER,
            min_quantity REAL NOT NULL DEFAULT 10.0,
            max_quantity REAL NOT NULL DEFAULT 100.0,
            reorder_quantity REAL NOT NULL DEFAULT 25.0,
            active INTEGER DEFAULT 1,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
            FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
        );
        """)

        # Partners (Suppliers & Customers)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS partners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            partner_type TEXT NOT NULL DEFAULT 'supplier', -- 'supplier', 'customer'
            email TEXT,
            phone TEXT,
            address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_FILE)
