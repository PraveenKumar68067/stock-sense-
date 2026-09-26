import datetime
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from app.database import get_db
from app.models import OperationCreate, StockAdjustmentCreate, QuickTransferCreate

router = APIRouter(prefix="/api/operations", tags=["operations"])

def generate_reference(cursor, op_type: str) -> str:
    prefixes = {
        "receipt": "REC",
        "delivery": "DEL",
        "internal": "INT",
        "adjustment": "ADJ"
    }
    pfx = prefixes.get(op_type, "OP")
    year = datetime.datetime.now().year
    cursor.execute("""
        SELECT COUNT(*) as cnt FROM operations WHERE op_type = ?
    """, (op_type,))
    count = cursor.fetchone()["cnt"] + 1
    return f"{pfx}/{year}/{count:04d}"

@router.get("")
def get_operations(
    op_type: Optional[str] = Query(None, description="receipt, delivery, internal, adjustment"),
    status: Optional[str] = Query(None, description="Draft, Waiting, Ready, Done, Canceled"),
    warehouse_id: Optional[int] = Query(None, description="Filter by warehouse"),
    search: Optional[str] = Query(None, description="Search reference or partner")
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT 
                o.id, o.reference, o.op_type, o.status, o.partner_name,
                o.source_location_id, o.dest_location_id, o.warehouse_id,
                o.scheduled_date, o.notes, o.created_at, o.validated_at,
                w.name as warehouse_name,
                sl.name as source_location_name, sl.code as source_location_code,
                dl.name as dest_location_name, dl.code as dest_location_code,
                u.name as creator_name,
                COUNT(ol.id) as item_count,
                COALESCE(SUM(ol.demanded_qty), 0) as total_demanded_qty,
                COALESCE(SUM(ol.done_qty), 0) as total_done_qty
            FROM operations o
            LEFT JOIN warehouses w ON o.warehouse_id = w.id
            LEFT JOIN locations sl ON o.source_location_id = sl.id
            LEFT JOIN locations dl ON o.dest_location_id = dl.id
            LEFT JOIN users u ON o.created_by = u.id
            LEFT JOIN operation_lines ol ON o.id = ol.operation_id
            WHERE 1=1
        """
        params = []
        if op_type and op_type != "all":
            query += " AND o.op_type = ?"
            params.append(op_type)
        if status and status != "all":
            query += " AND o.status = ?"
            params.append(status)
        if warehouse_id:
            query += " AND o.warehouse_id = ?"
            params.append(warehouse_id)
        if search:
            query += " AND (o.reference LIKE ? OR o.partner_name LIKE ?)"
            s = f"%{search}%"
            params.extend([s, s])

        query += " GROUP BY o.id ORDER BY o.id DESC"
        cursor.execute(query, params)
        ops = [dict(row) for row in cursor.fetchall()]
        return {"operations": ops, "count": len(ops)}

@router.get("/{op_id}")
def get_operation(op_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                o.id, o.reference, o.op_type, o.status, o.partner_name,
                o.source_location_id, o.dest_location_id, o.warehouse_id,
                o.scheduled_date, o.notes, o.created_at, o.validated_at,
                w.name as warehouse_name,
                sl.name as source_location_name, dl.name as dest_location_name
            FROM operations o
            LEFT JOIN warehouses w ON o.warehouse_id = w.id
            LEFT JOIN locations sl ON o.source_location_id = sl.id
            LEFT JOIN locations dl ON o.dest_location_id = dl.id
            WHERE o.id = ?
        """, (op_id,))
        op = cursor.fetchone()
        if not op:
            raise HTTPException(status_code=404, detail="Operation not found")

        op_dict = dict(op)
        # Fetch lines
        cursor.execute("""
            SELECT 
                ol.id, ol.product_id, ol.demanded_qty, ol.done_qty, ol.unit_price,
                p.name as product_name, p.sku as product_sku, p.uom as product_uom
            FROM operation_lines ol
            JOIN products p ON ol.product_id = p.id
            WHERE ol.operation_id = ?
        """, (op_id,))
        op_dict["lines"] = [dict(line) for line in cursor.fetchall()]
        return op_dict

@router.post("")
def create_operation(data: OperationCreate, user_id: Optional[int] = 1):
    with get_db() as conn:
        cursor = conn.cursor()
        ref = generate_reference(cursor, data.op_type)
        scheduled = data.scheduled_date or datetime.datetime.now().strftime("%Y-%m-%d")

        # Resolve default locations if not provided
        src_id = data.source_location_id
        dst_id = data.dest_location_id
        wh_id = data.warehouse_id

        if not wh_id:
            cursor.execute("SELECT id FROM warehouses LIMIT 1")
            wh_row = cursor.fetchone()
            wh_id = wh_row["id"] if wh_row else 1

        if data.op_type == "receipt":
            if not src_id:
                cursor.execute("SELECT id FROM locations WHERE location_type = 'vendor' LIMIT 1")
                v = cursor.fetchone()
                src_id = v["id"] if v else 1
            if not dst_id:
                cursor.execute("SELECT id FROM locations WHERE warehouse_id = ? AND location_type = 'internal' LIMIT 1", (wh_id,))
                d = cursor.fetchone()
                dst_id = d["id"] if d else 1
        elif data.op_type == "delivery":
            if not src_id:
                cursor.execute("SELECT id FROM locations WHERE warehouse_id = ? AND location_type = 'internal' LIMIT 1", (wh_id,))
                s = cursor.fetchone()
                src_id = s["id"] if s else 1
            if not dst_id:
                cursor.execute("SELECT id FROM locations WHERE location_type = 'customer' LIMIT 1")
                c = cursor.fetchone()
                dst_id = c["id"] if c else 1

        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, created_by)
            VALUES (?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?)
        """, (ref, data.op_type, data.partner_name, src_id, dst_id, wh_id, scheduled, data.notes, user_id))
        op_id = cursor.lastrowid

        for line in data.lines:
            cursor.execute("""
                INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty, unit_price)
                VALUES (?, ?, ?, 0.0, ?)
            """, (op_id, line.product_id, line.demanded_qty, line.unit_price or 0.0))

        return {"success": True, "message": f"{data.op_type.capitalize()} created successfully", "operation_id": op_id, "reference": ref}

@router.post("/{op_id}/advance-status")
def advance_status(op_id: int):
    """
    Advance operation status:
    Receipt: Draft -> Waiting -> Ready -> Validate (Done)
    Delivery: Draft -> Waiting (Pick) -> Ready (Pack) -> Validate (Done)
    Internal: Draft -> Ready -> Validate (Done)
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM operations WHERE id = ?", (op_id,))
        op = cursor.fetchone()
        if not op:
            raise HTTPException(status_code=404, detail="Operation not found")

        curr_status = op["status"]
        if curr_status == "Done":
            return {"success": False, "message": "Operation is already completed and validated"}
        if curr_status == "Canceled":
            return {"success": False, "message": "Operation is canceled"}

        next_status = "Done"
        if curr_status == "Draft":
            next_status = "Waiting"
        elif curr_status == "Waiting":
            next_status = "Ready"
        elif curr_status == "Ready":
            # If moving to Done, invoke validation directly
            return validate_operation(op_id)

        cursor.execute("UPDATE operations SET status = ? WHERE id = ?", (next_status, op_id))
        return {"success": True, "status": next_status, "message": f"Status updated to {next_status}"}

@router.post("/{op_id}/validate")
def validate_operation(op_id: int, user_name: str = "Praveen Kumar"):
    """
    Validates operation and automatically updates stock:
    - Receipt: increments dest location stock
    - Delivery: decrements source location stock
    - Internal: transfers from source to dest location
    - Writes immutable ledger audit entries
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM operations WHERE id = ?", (op_id,))
        op = cursor.fetchone()
        if not op:
            raise HTTPException(status_code=404, detail="Operation not found")

        if op["status"] == "Done":
            raise HTTPException(status_code=400, detail="Operation is already validated and Done")

        cursor.execute("SELECT * FROM operation_lines WHERE operation_id = ?", (op_id,))
        lines = [dict(r) for r in cursor.fetchall()]
        if not lines:
            raise HTTPException(status_code=400, detail="Operation has no product line items")

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        op_type = op["op_type"]
        src_id = op["source_location_id"]
        dst_id = op["dest_location_id"]
        ref = op["reference"]

        for line in lines:
            qty = line["demanded_qty"]
            pid = line["product_id"]

            if op_type == "receipt":
                # Increase destination stock
                cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (pid, dst_id))
                quant = cursor.fetchone()
                if quant:
                    cursor.execute("UPDATE stock_quants SET quantity = quantity + ?, updated_at = ? WHERE id = ?", (qty, now_str, quant["id"]))
                else:
                    cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?)", (pid, dst_id, qty, now_str))

                # Ledger entry
                cursor.execute("""
                    INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
                    VALUES (?, ?, 'receipt', ?, ?, ?, ?, ?, ?, ?)
                """, (op_id, ref, pid, src_id, dst_id, qty, user_name, f"Receipt from {op['partner_name'] or 'Vendor'}", now_str))

            elif op_type == "delivery":
                # Check sufficient stock
                cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (pid, src_id))
                quant = cursor.fetchone()
                current_qty = quant["quantity"] if quant else 0.0

                if current_qty < qty:
                    # Allow validation but warn / deduct into negative or error
                    pass # In practical IMS we update quant, let's decrement
                
                if quant:
                    cursor.execute("UPDATE stock_quants SET quantity = quantity - ?, updated_at = ? WHERE id = ?", (qty, now_str, quant["id"]))
                else:
                    cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?)", (pid, src_id, -qty, now_str))

                # Ledger entry
                cursor.execute("""
                    INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
                    VALUES (?, ?, 'delivery', ?, ?, ?, ?, ?, ?, ?)
                """, (op_id, ref, pid, src_id, dst_id, -qty, user_name, f"Delivery to {op['partner_name'] or 'Customer'}", now_str))

            elif op_type == "internal":
                # Decrement source, increment dest
                cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (pid, src_id))
                s_quant = cursor.fetchone()
                if s_quant:
                    cursor.execute("UPDATE stock_quants SET quantity = quantity - ?, updated_at = ? WHERE id = ?", (qty, now_str, s_quant["id"]))
                else:
                    cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?)", (pid, src_id, -qty, now_str))

                cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (pid, dst_id))
                d_quant = cursor.fetchone()
                if d_quant:
                    cursor.execute("UPDATE stock_quants SET quantity = quantity + ?, updated_at = ? WHERE id = ?", (qty, now_str, d_quant["id"]))
                else:
                    cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?)", (pid, dst_id, qty, now_str))

                # Ledger entry
                cursor.execute("""
                    INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
                    VALUES (?, ?, 'internal', ?, ?, ?, ?, ?, ?, ?)
                """, (op_id, ref, pid, src_id, dst_id, qty, user_name, f"Internal Transfer: {op['notes'] or 'Stock Relocation'}", now_str))

            # Set done_qty = demanded_qty
            cursor.execute("UPDATE operation_lines SET done_qty = demanded_qty WHERE id = ?", (line["id"],))

        # Mark operation Done
        cursor.execute("UPDATE operations SET status = 'Done', validated_at = ? WHERE id = ?", (now_str, op_id))

        return {
            "success": True,
            "message": f"Operation {ref} validated successfully. Stock levels updated and ledger logged.",
            "reference": ref,
            "status": "Done"
        }

@router.post("/{op_id}/cancel")
def cancel_operation(op_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM operations WHERE id = ?", (op_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Operation not found")
        if row["status"] == "Done":
            raise HTTPException(status_code=400, detail="Cannot cancel an already completed and validated operation")

        cursor.execute("UPDATE operations SET status = 'Canceled' WHERE id = ?", (op_id,))
        return {"success": True, "message": "Operation canceled"}

# Stock Adjustment Endpoint (Physical Count vs Recorded Stock)
@router.post("/adjustments")
def create_stock_adjustment(adj: StockAdjustmentCreate, user_name: str = "Praveen Kumar"):
    """
    Stock Adjustments:
    Fix mismatches between:
    1. Recorded stock
    2. Physical count
    Steps: Select product/location, enter counted quantity -> auto-updates and logs adjustment.
    Example: 3 kg steel damaged -> Stock: -3
    """
    with get_db() as conn:
        cursor = conn.cursor()
        # Fetch current recorded quantity
        cursor.execute("""
            SELECT id, quantity FROM stock_quants 
            WHERE product_id = ? AND location_id = ?
        """, (adj.product_id, adj.location_id))
        quant = cursor.fetchone()
        recorded_qty = quant["quantity"] if quant else 0.0
        difference = adj.counted_quantity - recorded_qty
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        ref = generate_reference(cursor, "adjustment")

        # Fetch warehouse
        cursor.execute("SELECT warehouse_id FROM locations WHERE id = ?", (adj.location_id,))
        loc_row = cursor.fetchone()
        wh_id = loc_row["warehouse_id"] if loc_row else 1

        # Fetch scrap/loss location
        cursor.execute("SELECT id FROM locations WHERE location_type = 'inventory_loss' LIMIT 1")
        loss_loc = cursor.fetchone()
        loss_loc_id = loss_loc["id"] if loss_loc else 1

        # Create operation record for adjustment
        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, validated_at)
            VALUES (?, 'adjustment', 'Done', 'Physical Count Adjustment', ?, ?, ?, ?, ?, ?)
        """, (ref, adj.location_id, loss_loc_id if difference < 0 else adj.location_id, wh_id, now_str[:10], f"{adj.reason} (Count: {adj.counted_quantity}, Recorded: {recorded_qty}, Diff: {difference:+.2f})", now_str))
        op_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty)
            VALUES (?, ?, ?, ?)
        """, (op_id, adj.product_id, abs(difference), abs(difference)))

        # Update or create quant with exact counted quantity
        if quant:
            cursor.execute("UPDATE stock_quants SET quantity = ?, updated_at = ? WHERE id = ?", (adj.counted_quantity, now_str, quant["id"]))
        else:
            cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?)", (adj.product_id, adj.location_id, adj.counted_quantity, now_str))

        # Log into Stock Ledger
        src_ledger_id = adj.location_id if difference < 0 else loss_loc_id
        dst_ledger_id = loss_loc_id if difference < 0 else adj.location_id
        cursor.execute("""
            INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
            VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)
        """, (op_id, ref, adj.product_id, src_ledger_id, dst_ledger_id, difference, user_name, adj.reason, now_str))

        return {
            "success": True,
            "message": f"Stock adjustment completed. Recorded: {recorded_qty}, Counted: {adj.counted_quantity}, Difference: {difference:+.2f}",
            "reference": ref,
            "recorded_quantity": recorded_qty,
            "counted_quantity": adj.counted_quantity,
            "difference": difference
        }

# Quick Transfer
@router.post("/quick-transfer")
def quick_transfer(data: QuickTransferCreate, user_name: str = "Praveen Kumar"):
    """
    Direct 1-step Internal Transfer:
    Move stock inside company (Main Warehouse -> Production Floor, Rack A -> Rack B, WH1 -> WH2)
    """
    with get_db() as conn:
        cursor = conn.cursor()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ref = generate_reference(cursor, "internal")

        cursor.execute("SELECT warehouse_id FROM locations WHERE id = ?", (data.source_location_id,))
        loc_row = cursor.fetchone()
        wh_id = loc_row["warehouse_id"] if loc_row else 1

        cursor.execute("""
            INSERT INTO operations (reference, op_type, status, partner_name, source_location_id, dest_location_id, warehouse_id, scheduled_date, notes, validated_at)
            VALUES (?, 'internal', 'Done', 'Internal Transfer', ?, ?, ?, ?, ?, ?)
        """, (ref, data.source_location_id, data.dest_location_id, wh_id, now_str[:10], data.notes, now_str))
        op_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO operation_lines (operation_id, product_id, demanded_qty, done_qty)
            VALUES (?, ?, ?, ?)
        """, (op_id, data.product_id, data.quantity, data.quantity))

        # Decrement source
        cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (data.product_id, data.source_location_id))
        sq = cursor.fetchone()
        if sq:
            cursor.execute("UPDATE stock_quants SET quantity = quantity - ?, updated_at = ? WHERE id = ?", (data.quantity, now_str, sq["id"]))
        else:
            cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?)", (data.product_id, data.source_location_id, -data.quantity, now_str))

        # Increment dest
        cursor.execute("SELECT id, quantity FROM stock_quants WHERE product_id = ? AND location_id = ?", (data.product_id, data.dest_location_id))
        dq = cursor.fetchone()
        if dq:
            cursor.execute("UPDATE stock_quants SET quantity = quantity + ?, updated_at = ? WHERE id = ?", (data.quantity, now_str, dq["id"]))
        else:
            cursor.execute("INSERT INTO stock_quants (product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?)", (data.product_id, data.dest_location_id, data.quantity, now_str))

        # Stock Ledger
        cursor.execute("""
            INSERT INTO stock_ledger (operation_id, reference, op_type, product_id, source_location_id, dest_location_id, quantity, user_name, notes, timestamp)
            VALUES (?, ?, 'internal', ?, ?, ?, ?, ?, ?, ?)
        """, (op_id, ref, data.product_id, data.source_location_id, data.dest_location_id, data.quantity, user_name, data.notes, now_str))

        return {"success": True, "message": f"Transferred {data.quantity} units successfully", "reference": ref}

# Stock Ledger / Move History
@router.get("/ledger/history")
def get_stock_ledger(
    product_id: Optional[int] = Query(None),
    op_type: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None)
):
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT 
                sl.id, sl.operation_id, sl.reference, sl.op_type, sl.product_id,
                sl.source_location_id, sl.dest_location_id, sl.quantity,
                sl.user_name, sl.notes, sl.timestamp,
                p.name as product_name, p.sku as product_sku, p.uom as product_uom,
                src.name as source_location_name, src.code as source_location_code,
                dst.name as dest_location_name, dst.code as dest_location_code
            FROM stock_ledger sl
            JOIN products p ON sl.product_id = p.id
            LEFT JOIN locations src ON sl.source_location_id = src.id
            LEFT JOIN locations dst ON sl.dest_location_id = dst.id
            WHERE 1=1
        """
        params = []
        if product_id:
            query += " AND sl.product_id = ?"
            params.append(product_id)
        if op_type and op_type != "all":
            query += " AND sl.op_type = ?"
            params.append(op_type)
        if search:
            query += " AND (sl.reference LIKE ? OR p.name LIKE ? OR p.sku LIKE ? OR sl.notes LIKE ?)"
            s = f"%{search}%"
            params.extend([s, s, s, s])

        query += " ORDER BY sl.id DESC"
        cursor.execute(query, params)
        ledger_entries = [dict(row) for row in cursor.fetchall()]
        return {"moves": ledger_entries, "count": len(ledger_entries)}
