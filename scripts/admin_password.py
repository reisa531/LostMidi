"""Create ADMIN_PASSWORD_HASH interactively; never accept a password on the CLI."""
import getpass
import hashlib
import secrets

if __name__ == "__main__":
    password = getpass.getpass("New administrator password (12+ characters): ")
    if len(password) < 12 or len(password.encode("utf-8")) > 1024:
        raise SystemExit("Use 12+ characters and at most 1024 UTF-8 bytes.")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600000)
    print("ADMIN_PASSWORD_HASH=pbkdf2_sha256:600000:" + salt.hex() + ":" + digest.hex())
