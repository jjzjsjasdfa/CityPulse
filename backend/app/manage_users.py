"""Create an administrator explicitly; public registration always creates regular users."""

import argparse
from getpass import getpass

from sqlmodel import Session, select

from app.core.database import engine
from app.core.security import hash_password
from app.models import User, UserRole
from app.schemas import Credentials


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a CityPulse administrator")
    parser.add_argument("email")
    parser.add_argument("--promote", action="store_true", help="Grant admin role to an existing active account; preserve its password")
    args = parser.parse_args()
    if args.promote:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.email == args.email.strip().lower())).first()
            if user is None:
                parser.error("Account does not exist; register it first or omit --promote")
            if not user.is_active:
                parser.error("Account is inactive; no account was changed")
            user.role = UserRole.admin
            session.add(user)
            session.commit()
        print("Administrator role granted; password unchanged. Sign in again in the app.")
        return
    password = getpass("New administrator password (12-128 characters): ")
    if password != getpass("Confirm password: "):
        parser.error("Passwords do not match")
    credentials = Credentials(email=args.email, password=password)
    with Session(engine) as session:
        email = str(credentials.email).lower()
        if session.exec(select(User).where(User.email == email)).first():
            parser.error("Account already exists; no account was changed")
        session.add(User(email=email, password_hash=hash_password(password), role=UserRole.admin))
        session.commit()
    print("Administrator created.")


if __name__ == "__main__":
    main()
