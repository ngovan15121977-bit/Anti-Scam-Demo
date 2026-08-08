"""Legacy entry point kept to prevent accidental destructive database resets.

Schema creation is now versioned in Alembic. This file deliberately does not
connect to PostgreSQL, embed credentials, or drop any table.
"""

from pathlib import Path


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    print("Schema is managed by Alembic.")
    print(f"Run from {project_root}:")
    print("  alembic upgrade head")
    print("Then import blacklist data if needed:")
    print("  cd backend")
    print("  python import_scams.py --file scams-done.xlsx")
