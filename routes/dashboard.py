from fastapi import APIRouter, Query
from typing import Optional
from app.database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/kpis")
def get_dashboard_kpis(warehouse_id: Optional[int] = Query(None)):
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Total Products in Stock & Total Valuation
        wh_filter_quant = ""
        params_quant = []
        if warehouse_id:
            wh_filter_quant = "JOIN locations l ON sq.location_id = l.id WHERE l.warehouse_id = ?"
            params_quant.append(warehouse_id)

        cursor.execute(f"""
            SELECT 
                COUNT(DISTINCT sq.product_id) as products_count,
                COALESCE(SUM(sq.quantity), 0) as total_units_in_stock,
                COALESCE(SUM(sq.quantity * p.cost_price), 0) as total_valuation
            FROM stock_quants sq
            JOIN products p ON sq.product_id = p.id
            {wh_filter_quant}
        """, params_quant)
        stock_stats = cursor.fetchone()

        # 2. Low Stock & Out of Stock Items
        cursor.execute("""
            SELECT 
                p.id, p.name, p.sku, p.min_stock, p.uom,
                COALESCE(SUM(sq.quantity), 0) as total_qty
            FROM products p
            LEFT JOIN stock_quants sq ON p.id = sq.product_id
            GROUP BY p.id
        """)
        all_prods = cursor.fetchall()
        low_stock_count = 0
        out_of_stock_count = 0
        for prod in all_prods:
            qty = prod["total_qty"]
            min_s = prod["min_stock"] or 0
            if qty <= 0:
                out_of_stock_count += 1
            elif qty <= min_s:
                low_stock_count += 1

        # 3. Pending Receipts (op_type = 'receipt' and status IN ('Draft', 'Waiting', 'Ready'))
        wh_filter_op = "AND o.warehouse_id = ?" if warehouse_id else ""
        op_params = [warehouse_id] if warehouse_id else []

        cursor.execute(f"""
            SELECT COUNT(*) as cnt 
            FROM operations o 
            WHERE o.op_type = 'receipt' AND o.status IN ('Draft', 'Waiting', 'Ready') {wh_filter_op}
        """, op_params)
        pending_receipts = cursor.fetchone()["cnt"]

        # 4. Pending Deliveries (op_type = 'delivery' and status IN ('Draft', 'Waiting', 'Ready'))
        cursor.execute(f"""
            SELECT COUNT(*) as cnt 
            FROM operations o 
            WHERE o.op_type = 'delivery' AND o.status IN ('Draft', 'Waiting', 'Ready') {wh_filter_op}
        """, op_params)
        pending_deliveries = cursor.fetchone()["cnt"]

        # 5. Internal Transfers Scheduled (op_type = 'internal' and status IN ('Draft', 'Waiting', 'Ready'))
        cursor.execute(f"""
            SELECT COUNT(*) as cnt 
            FROM operations o 
            WHERE o.op_type = 'internal' AND o.status IN ('Draft', 'Waiting', 'Ready') {wh_filter_op}
        """, op_params)
        scheduled_transfers = cursor.fetchone()["cnt"]

        # Operations breakdown for charts
        cursor.execute("""
            SELECT op_type, status, COUNT(*) as cnt
            FROM operations
            GROUP BY op_type, status
        """)
        operations_breakdown = [dict(r) for r in cursor.fetchall()]

        # Recent 10 ledger moves
        cursor.execute("""
            SELECT 
                sl.id, sl.reference, sl.op_type, sl.quantity, sl.user_name, sl.timestamp, sl.notes,
                p.name as product_name, p.sku as product_sku, p.uom,
                src.name as source_location_name, dst.name as dest_location_name
            FROM stock_ledger sl
            JOIN products p ON sl.product_id = p.id
            LEFT JOIN locations src ON sl.source_location_id = src.id
            LEFT JOIN locations dst ON sl.dest_location_id = dst.id
            ORDER BY sl.id DESC
            LIMIT 10
        """)
        recent_activity = [dict(r) for r in cursor.fetchall()]

        return {
            "total_products_count": stock_stats["products_count"],
            "total_units_in_stock": stock_stats["total_units_in_stock"],
            "total_inventory_valuation": round(stock_stats["total_valuation"], 2),
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
            "pending_receipts_count": pending_receipts,
            "pending_deliveries_count": pending_deliveries,
            "scheduled_transfers_count": scheduled_transfers,
            "operations_breakdown": operations_breakdown,
            "recent_activity": recent_activity
        }
