from __future__ import annotations

from app.services import projection_audit_repository as repository


class _Cursor:
    def __init__(self, *, rows=None, row=None):
        self.rows = rows or []
        self.row = row

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.row


class _Connection:
    def __init__(self, rows, total):
        self.rows = rows
        self.total = total
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((statement, params))
        if "COUNT(DISTINCT" in statement:
            return _Cursor(row={"value": self.total})
        return _Cursor(rows=self.rows)


class _ConnectionContext:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self.connection

    def __exit__(self, *_):
        return False


def test_feature_recommendations_are_limited_to_displayed_rows(monkeypatch) -> None:
    connection = _Connection(
        [
            {"value": "Bacteroides_uniformis"},
            {"value": "Akkermansia_muciniphila"},
        ],
        total=2,
    )
    monkeypatch.setattr(repository, "connect", lambda: _ConnectionContext(connection))

    values, total = repository.query_distinct_row_values(
        42,
        "feature",
        prioritize_displayed=True,
        displayed_only=True,
        limit=30,
    )

    assert values == ["Bacteroides_uniformis", "Akkermansia_muciniphila"]
    assert total == 2
    count_statement, count_params = connection.calls[0]
    query_statement, query_params = connection.calls[1]
    assert "COUNT(DISTINCT feature)" in count_statement
    assert "status_code = 'displayed'" in count_statement
    assert count_params == [42]
    assert "GROUP BY feature" in query_statement
    assert "ORDER BY first_row_index ASC, feature ASC" in query_statement
    assert query_params == [42, 30, 0]


def test_feature_search_uses_complete_source_and_ranked_matches(monkeypatch) -> None:
    connection = _Connection([{"value": "Akkermansia_muciniphila"}], total=312)
    monkeypatch.setattr(repository, "connect", lambda: _ConnectionContext(connection))

    values, total = repository.query_distinct_row_values(
        42,
        "feature",
        query="akk",
        limit=50,
    )

    assert values == ["Akkermansia_muciniphila"]
    assert total == 312
    count_statement, count_params = connection.calls[0]
    query_statement, query_params = connection.calls[1]
    assert "LOWER(feature) LIKE ? ESCAPE '!'" in count_statement
    assert count_params == [42, "%akk%"]
    assert "WHEN LOWER(feature) = ? THEN 0" in query_statement
    assert "WHEN LOWER(feature) LIKE ? ESCAPE '!' THEN 1" in query_statement
    assert "GROUP BY feature" in query_statement
    assert query_params == [42, "%akk%", "akk", "akk%", "% akk%", 50, 0]
