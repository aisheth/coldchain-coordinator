"""Usage:
    python -m app.cli init-db
    python -m app.cli create-owner --org "Company" --username owner --name "Owner Name"

The owner password is prompted interactively unless --password is explicitly provided.
"""
import argparse
import getpass

from .db import SessionLocal, engine
from .models import Base
from .seed import create_owner, seed_uoms


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db", help="create tables and seed units of measure")
    owner = sub.add_parser("create-owner", help="create an organisation with its first owner")
    owner.add_argument("--org", required=True)
    owner.add_argument("--username", required=True)
    owner.add_argument("--name", required=True)
    owner.add_argument("--email")
    owner.add_argument("--password")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_uoms(db)
        if args.cmd == "create-owner":
            password = args.password or getpass.getpass("Password: ")
            user = create_owner(db, args.org, args.username, password, args.name, args.email)
            print(f"Created owner '{user.username}' for organisation '{args.org}'")
        db.commit()
    print("Done.")


if __name__ == "__main__":
    main()
