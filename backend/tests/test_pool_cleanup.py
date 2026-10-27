"""Unit tests for psycopg v3 connection cleanup order in get_db_conn."""

from unittest.mock import MagicMock, patch
import psycopg
from app.database.pool import get_db_conn


class _FakePsycopgConnection:
    """Simulates psycopg v3 Connection state transitions (IDLE <-> INTRANS)."""

    def __init__(self) -> None:
        self.in_transaction = False
        self._autocommit = False
        self._read_only = False
        self.events: list[str] = []

    @property
    def autocommit(self) -> bool:
        return self._autocommit

    @autocommit.setter
    def autocommit(self, value: bool) -> None:
        if self.in_transaction:
            raise psycopg.ProgrammingError("cannot set 'autocommit' while in transaction")
        self._autocommit = value

    @property
    def read_only(self) -> bool:
        return self._read_only

    @read_only.setter
    def read_only(self, value: bool) -> None:
        if self.in_transaction:
            raise psycopg.ProgrammingError(
                "cannot set property 'read_only' when the connection is in a transaction"
            )
        self._read_only = value
        self.events.append(f"read_only={value}")

    def execute(self, _sql: object) -> None:
        if not self._autocommit:
            self.in_transaction = True
        self.events.append("execute")

    def rollback(self) -> None:
        self.in_transaction = False
        self.events.append("rollback")


def test_get_db_conn_rolls_back_before_resetting_read_only() -> None:
    """Ensures rollback runs before read_only=False so connections return IDLE to pool."""
    fake_conn = _FakePsycopgConnection()
    fake_pool = MagicMock()
    fake_pool.getconn.return_value = fake_conn

    with patch("app.database.pool.get_pool", return_value=fake_pool):
        with get_db_conn(schema="public", readonly=True) as conn:
            # Simulate a SELECT query opening an implicit transaction (INTRANS)
            conn.in_transaction = True

    assert fake_conn.in_transaction is False
    assert fake_conn.read_only is False
    assert fake_conn.events[-2:] == ["rollback", "read_only=False"]
    fake_pool.putconn.assert_called_once_with(fake_conn)
