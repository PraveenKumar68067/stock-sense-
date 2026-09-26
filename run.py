import os
import sys

if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding="utf-8")

import uvicorn
from app.database import init_db
from app.seed_data import seed_database

def main():
    print("=" * 65)
    print("  🚀 Starting StockSense - Modular Inventory Management System")
    print("=" * 65)
    print("  Initializing database & seeding default records...")
    init_db()
    seed_database()

    print("\n  📍 Application URL: http://127.0.0.1:8000")
    print("  📖 Interactive Swagger API Docs: http://127.0.0.1:8000/docs")
    print("\n  🔑 Default Demo Credentials:")
    print("     • Inventory Manager: manager@stocksense.com / admin123")
    print("     • Warehouse Staff:   staff@stocksense.com   / staff123")
    print("=" * 65)
    print("\n  Starting server on http://127.0.0.1:8000 ... Press Ctrl+C to stop.\n")

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()
