from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.database import get_db
from app.models import WarehouseCreate, LocationCreate, CategoryCreate

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Warehouses
@router.get("/warehouses")
def get_warehouses():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                w.id, w.code, w.name, w.address, w.created_at,
                COUNT(DISTINCT l.id) as location_count,
                COALESCE(SUM(sq.quantity), 0) as total_units_stored
            FROM warehouses w
            LEFT JOIN locations l ON w.id = l.warehouse_id
            LEFT JOIN stock_quants sq ON l.id = sq.location_id
            GROUP BY w.id
            ORDER BY w.id ASC
        """)
        whs = [dict(row) for row in cursor.fetchall()]
        return {"warehouses": whs}

@router.post("/warehouses")
def create_warehouse(data: WarehouseCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM warehouses WHERE code = ?", (data.code,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Warehouse code must be unique")

        cursor.execute("INSERT INTO warehouses (code, name, address) VALUES (?, ?, ?)", (data.code, data.name, data.address))
        wh_id = cursor.lastrowid

        # Auto-create default Stock location
        cursor.execute("""
            INSERT INTO locations (warehouse_id, code, name, location_type)
            VALUES (?, ?, ?, 'internal')
        """, (wh_id, f"{data.code}/STOCK", f"{data.name} Stock"))

        return {"success": True, "message": "Warehouse created successfully", "warehouse_id": wh_id}

# Locations
@router.get("/locations")
def get_locations(warehouse_id: Optional[int] = Query(None)):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT 
                l.id, l.warehouse_id, l.code, l.name, l.location_type,
                w.code as warehouse_code, w.name as warehouse_name,
                COALESCE(SUM(sq.quantity), 0) as current_quantity,
                COUNT(DISTINCT sq.product_id) as unique_products
            FROM locations l
            LEFT JOIN warehouses w ON l.warehouse_id = w.id
            LEFT JOIN stock_quants sq ON l.id = sq.location_id
            WHERE 1=1
        """
        params = []
        if warehouse_id:
            query += " AND l.warehouse_id = ?"
            params.append(warehouse_id)

        query += " GROUP BY l.id ORDER BY l.warehouse_id, l.name"
        cursor.execute(query, params)
        locs = [dict(row) for row in cursor.fetchall()]
        return {"locations": locs}

@router.post("/locations")
def create_location(data: LocationCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO locations (warehouse_id, code, name, location_type)
            VALUES (?, ?, ?, ?)
        """, (data.warehouse_id, data.code, data.name, data.location_type))
        return {"success": True, "message": "Location created successfully", "location_id": cursor.lastrowid}

# Categories
@router.get("/categories")
def get_categories():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                c.id, c.name, c.description, c.color,
                COUNT(p.id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            GROUP BY c.id
            ORDER BY c.name ASC
        """)
        cats = [dict(row) for row in cursor.fetchall()]
        return {"categories": cats}

@router.post("/categories")
def create_category(data: CategoryCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM categories WHERE name = ?", (data.name,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Category already exists")

        cursor.execute("INSERT INTO categories (name, description, color) VALUES (?, ?, ?)", (data.name, data.description, data.color))
        return {"success": True, "message": "Category created successfully", "category_id": cursor.lastrowid}

# Partners
@router.get("/partners")
def get_partners(partner_type: Optional[str] = Query(None)):
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM partners WHERE 1=1"
        params = []
        if partner_type:
            query += " AND partner_type = ?"
            params.append(partner_type)
        query += " ORDER BY name ASC"
        cursor.execute(query, params)
        partners = [dict(row) for row in cursor.fetchall()]
        return {"partners": partners}
