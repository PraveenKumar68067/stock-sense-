import datetime
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.database import get_db
from app.models import ProductCreate, ProductUpdate, ReorderingRuleCreate

router = APIRouter(prefix="/api/products", tags=["products"])

@router.get("")
def get_products(
    search: Optional[str] = Query(None, description="Search by name, SKU or barcode"),
    category_id: Optional[int] = Query(None, description="Filter by category"),
    stock_status: Optional[str] = Query(None, description="all, low_stock, out_of_stock, in_stock"),
    warehouse_id: Optional[int] = Query(None, description="Filter by warehouse")
):
    with get_db() as conn:
        cursor = conn.cursor()

        query = """
            SELECT 
                p.id, p.name, p.sku, p.category_id, p.uom, p.cost_price, p.sale_price,
                p.min_stock, p.max_stock, p.reorder_qty, p.barcode, p.description, p.created_at,
                c.name as category_name, c.color as category_color,
                COALESCE(SUM(sq.quantity), 0) as total_quantity,
                COALESCE(SUM(sq.quantity * p.cost_price), 0) as total_valuation
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN stock_quants sq ON p.id = sq.product_id
            LEFT JOIN locations l ON sq.location_id = l.id
            WHERE 1=1
        """
        params = []

        if warehouse_id:
            query += " AND (l.warehouse_id = ? OR sq.location_id IS NULL)"
            params.append(warehouse_id)

        if category_id:
            query += " AND p.category_id = ?"
            params.append(category_id)

        if search:
            query += " AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)"
            term = f"%{search}%"
            params.extend([term, term, term])

        query += " GROUP BY p.id ORDER BY p.name ASC"

        cursor.execute(query, params)
        raw_products = [dict(row) for row in cursor.fetchall()]

        results = []
        for p in raw_products:
            total_qty = p["total_quantity"]
            min_s = p["min_stock"] or 0

            if total_qty <= 0:
                status = "out_of_stock"
            elif total_qty <= min_s:
                status = "low_stock"
            else:
                status = "in_stock"
            p["status"] = status

            # Filter by stock_status if requested
            if stock_status and stock_status != "all":
                if stock_status == "low_stock" and status != "low_stock":
                    continue
                if stock_status == "out_of_stock" and status != "out_of_stock":
                    continue
                if stock_status == "in_stock" and status != "in_stock":
                    continue

            # Fetch stock breakdown per location for this product
            cursor.execute("""
                SELECT 
                    sq.location_id, sq.quantity,
                    l.code as location_code, l.name as location_name, l.location_type,
                    w.id as warehouse_id, w.code as warehouse_code, w.name as warehouse_name
                FROM stock_quants sq
                JOIN locations l ON sq.location_id = l.id
                LEFT JOIN warehouses w ON l.warehouse_id = w.id
                WHERE sq.product_id = ? AND sq.quantity > 0
                ORDER BY w.name, l.name
            """, (p["id"],))
            p["locations"] = [dict(loc) for loc in cursor.fetchall()]
            results.append(p)

        return {"products": results, "count": len(results)}

@router.get("/{product_id}")
def get_product(product_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                p.id, p.name, p.sku, p.category_id, p.uom, p.cost_price, p.sale_price,
                p.min_stock, p.max_stock, p.reorder_qty, p.barcode, p.description, p.created_at,
                c.name as category_name, c.color as category_color,
                COALESCE(SUM(sq.quantity), 0) as total_quantity
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN stock_quants sq ON p.id = sq.product_id
            WHERE p.id = ?
            GROUP BY p.id
        """, (product_id,))
        prod = cursor.fetchone()
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found")

        prod_dict = dict(prod)

        # Fetch locations
        cursor.execute("""
            SELECT 
                sq.location_id, sq.quantity,
                l.code as location_code, l.name as location_name, l.location_type,
                w.id as warehouse_id, w.code as warehouse_code, w.name as warehouse_name
            FROM stock_quants sq
            JOIN locations l ON sq.location_id = l.id
            LEFT JOIN warehouses w ON l.warehouse_id = w.id
            WHERE sq.product_id = ?
            ORDER BY w.name, l.name
        """, (product_id,))
        prod_dict["locations"] = [dict(row) for row in cursor.fetchall()]

        # Fetch reordering rules
        cursor.execute("""
            SELECT 
                rr.id, rr.warehouse_id, rr.location_id, rr.min_quantity, rr.max_quantity, rr.reorder_quantity,
                w.name as warehouse_name, l.name as location_name
            FROM reordering_rules rr
            LEFT JOIN warehouses w ON rr.warehouse_id = w.id
            LEFT JOIN locations l ON rr.location_id = l.id
            WHERE rr.product_id = ?
        """, (product_id,))
        prod_dict["reordering_rules"] = [dict(row) for row in cursor.fetchall()]

        return prod_dict

@router.post("")
def create_product(data: ProductCreate):
    with get_db() as conn:
        cursor = conn.cursor()

        # Check SKU uniqueness
        cursor.execute("SELECT id FROM products WHERE sku = ?", (data.sku,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail=f"Product with SKU '{data.sku}' already exists")

        barcode = data.barcode or f"BAR-{data.sku}"
        cursor.execute("""
            INSERT INTO products (name, sku, category_id, uom, cost_price, sale_price, min_stock, max_stock, reorder_qty, barcode, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (data.name, data.sku, data.category_id, data.uom, data.cost_price, data.sale_price, data.min_stock, data.max_stock, data.reorder_qty, barcode, data.description))
        product_id = cursor.lastrowid

        # If initial stock provided, create quant and ledger entry
        if data.initial_stock and data.initial_stock > 0:
            location_id = data.initial_location_id
            if not location_id:
                # Default to first internal location
                cursor.execute("SELECT id FROM locations WHERE location_type = 'internal' ORDER BY id ASC LIMIT 1")
                first_loc = cursor.fetchone()
                location_id = first_loc["id"] if first_loc else 1

            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT INTO stock_quants (product_id, location_id, quantity, updated_at)
                VALUES (?, ?, ?, ?)
            """, (product_id, location_id, data.initial_stock, now_str))

            # Virtual vendor location
            cursor.execute("SELECT id FROM locations WHERE location_type = 'vendor' LIMIT 1")
            vend = cursor.fetchone()
            vend_id = vend["id"] if vend else location_id

            cursor.execute("""
                INSERT INTO stock_ledger (reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
                VALUES ('INIT-STOCK', 'receipt', ?, ?, ?, ?, 'System', 'Initial stock on product creation', ?)
            """, (product_id, vend_id, location_id, data.initial_stock, now_str))

        # Add default reordering rule
        cursor.execute("""
            INSERT INTO reordering_rules (product_id, min_quantity, max_quantity, reorder_quantity)
            VALUES (?, ?, ?, ?)
        """, (product_id, data.min_stock, data.max_stock, data.reorder_qty))

        return {"success": True, "message": "Product created successfully", "product_id": product_id}

@router.put("/{product_id}")
def update_product(product_id: int, data: ProductUpdate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM products WHERE id = ?", (product_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")

        updates = []
        params = []
        if data.name is not None:
            updates.append("name = ?")
            params.append(data.name)
        if data.category_id is not None:
            updates.append("category_id = ?")
            params.append(data.category_id)
        if data.uom is not None:
            updates.append("uom = ?")
            params.append(data.uom)
        if data.cost_price is not None:
            updates.append("cost_price = ?")
            params.append(data.cost_price)
        if data.sale_price is not None:
            updates.append("sale_price = ?")
            params.append(data.sale_price)
        if data.min_stock is not None:
            updates.append("min_stock = ?")
            params.append(data.min_stock)
        if data.max_stock is not None:
            updates.append("max_stock = ?")
            params.append(data.max_stock)
        if data.reorder_qty is not None:
            updates.append("reorder_qty = ?")
            params.append(data.reorder_qty)
        if data.barcode is not None:
            updates.append("barcode = ?")
            params.append(data.barcode)
        if data.description is not None:
            updates.append("description = ?")
            params.append(data.description)

        if updates:
            params.append(product_id)
            cursor.execute(f"UPDATE products SET {', '.join(updates)} WHERE id = ?", params)

        return {"success": True, "message": "Product updated successfully"}

@router.delete("/{product_id}")
def delete_product(product_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
        return {"success": True, "message": "Product deleted successfully"}

# Reordering rules endpoints
@router.post("/reordering-rules")
def create_reordering_rule(rule: ReorderingRuleCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO reordering_rules (product_id, warehouse_id, location_id, min_quantity, max_quantity, reorder_quantity)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (rule.product_id, rule.warehouse_id, rule.location_id, rule.min_quantity, rule.max_quantity, rule.reorder_quantity))
        return {"success": True, "message": "Reordering rule saved"}

@router.get("/reordering-rules/alerts")
def get_low_stock_alerts():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                p.id, p.name, p.sku, p.uom, p.min_stock, p.max_stock, p.reorder_qty,
                c.name as category_name, c.color as category_color,
                COALESCE(SUM(sq.quantity), 0) as current_stock,
                (p.min_stock - COALESCE(SUM(sq.quantity), 0)) as deficit_qty
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN stock_quants sq ON p.id = sq.product_id
            GROUP BY p.id
            HAVING current_stock <= p.min_stock
            ORDER BY current_stock ASC
        """)
        alerts = [dict(row) for row in cursor.fetchall()]
        return {"alerts": alerts, "count": len(alerts)}
