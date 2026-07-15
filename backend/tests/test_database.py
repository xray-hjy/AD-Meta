from __future__ import annotations

from unittest.mock import Mock

from pymysql.cursors import DictCursor

from app.core.database import PooledConnection


def test_mysql_adapter_uses_dict_cursor_after_sqlalchemy_connects() -> None:
    raw = Mock()
    driver = Mock()
    cursor = Mock()
    raw.driver_connection = driver
    driver.cursor.return_value = cursor
    connection = PooledConnection(raw, mysql=True)

    returned = connection.execute("SELECT id FROM datasets WHERE slug = ?", ("demo",))

    driver.cursor.assert_called_once_with(DictCursor)
    cursor.execute.assert_called_once_with(
        "SELECT id FROM datasets WHERE slug = %s",
        ("demo",),
    )
    assert returned is cursor
