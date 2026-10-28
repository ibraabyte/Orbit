import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.models import Base

if context.config.config_file_name:
    fileConfig(context.config.config_file_name)

# Read the URL directly so migrations don't need the rest of the app's settings (like the JWT secret).
url = context.config.get_main_option("sqlalchemy.url") or os.environ.get("ORBIT_DATABASE_URL")
if not url:
    raise RuntimeError("Set ORBIT_DATABASE_URL to run migrations.")


def run_migrations_offline() -> None:
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with create_engine(url).connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
