import random
import datetime
from fastapi import APIRouter, HTTPException, Depends
from app.database import get_db
from app.models import UserLogin, UserRegister, PasswordResetRequest, PasswordResetConfirm, UserProfileUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register")
def register(user: UserRegister):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (user.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="User with this email already exists")

        cursor.execute("""
            INSERT INTO users (name, email, password, role, assigned_warehouse_id)
            VALUES (?, ?, ?, ?, ?)
        """, (user.name, user.email, user.password, user.role, user.assigned_warehouse_id))
        user_id = cursor.lastrowid

        return {
            "success": True,
            "message": "User registered successfully",
            "user": {
                "id": user_id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "assigned_warehouse_id": user.assigned_warehouse_id
            }
        }

@router.post("/login")
def login(credentials: UserLogin):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.name, u.email, u.role, u.assigned_warehouse_id, w.name as warehouse_name
            FROM users u
            LEFT JOIN warehouses w ON u.assigned_warehouse_id = w.id
            WHERE u.email = ? AND u.password = ?
        """, (credentials.email, credentials.password))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        return {
            "success": True,
            "message": "Logged in successfully",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"],
                "assigned_warehouse_id": user["assigned_warehouse_id"],
                "warehouse_name": user["warehouse_name"] or "All Warehouses"
            }
        }

@router.post("/request-otp")
def request_otp(data: PasswordResetRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM users WHERE email = ?", (data.email,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="No account registered with this email")

        # Generate 6-digit OTP
        otp = f"{random.randint(100000, 999999)}"
        expires_at = (datetime.datetime.now() + datetime.timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?", (otp, expires_at, user["id"]))

        # For the hackathon demo, we also return the OTP in the JSON response so the user can easily test it directly
        return {
            "success": True,
            "message": f"OTP sent to {data.email}",
            "demo_otp": otp, # Provided for testing without external SMTP config
            "expires_in_minutes": 10
        }

@router.post("/reset-password")
def reset_password(data: PasswordResetConfirm):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, otp_code, otp_expires_at FROM users WHERE email = ?", (data.email,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not user["otp_code"] or user["otp_code"] != data.otp:
            raise HTTPException(status_code=400, detail="Invalid or incorrect OTP code")

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if user["otp_expires_at"] and user["otp_expires_at"] < now_str:
            raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

        # Update password & clear OTP
        cursor.execute("UPDATE users SET password = ?, otp_code = NULL, otp_expires_at = NULL WHERE id = ?", (data.new_password, user["id"]))

        return {
            "success": True,
            "message": "Password reset successfully. You can now login with your new password."
        }

@router.get("/users")
def get_users():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.name, u.email, u.role, u.assigned_warehouse_id, w.name as warehouse_name
            FROM users u
            LEFT JOIN warehouses w ON u.assigned_warehouse_id = w.id
            ORDER BY u.id ASC
        """)
        users = [dict(row) for row in cursor.fetchall()]
        return {"users": users}

@router.put("/users/{user_id}")
def update_profile(user_id: int, data: UserProfileUpdate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        updates = []
        params = []
        if data.name is not None:
            updates.append("name = ?")
            params.append(data.name)
        if data.role is not None:
            updates.append("role = ?")
            params.append(data.role)
        if data.assigned_warehouse_id is not None:
            updates.append("assigned_warehouse_id = ?")
            params.append(data.assigned_warehouse_id)

        if updates:
            params.append(user_id)
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)

        cursor.execute("""
            SELECT u.id, u.name, u.email, u.role, u.assigned_warehouse_id, w.name as warehouse_name
            FROM users u
            LEFT JOIN warehouses w ON u.assigned_warehouse_id = w.id
            WHERE u.id = ?
        """, (user_id,))
        updated_user = dict(cursor.fetchone())

        return {
            "success": True,
            "message": "Profile updated",
            "user": updated_user
        }
