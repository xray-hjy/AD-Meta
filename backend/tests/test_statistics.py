from __future__ import annotations

import unittest

import numpy as np

from app.compute.statistics import benjamini_hochberg, rank_biserial_from_u


class MultipleTestingTests(unittest.TestCase):
    def test_benjamini_hochberg_preserves_order_and_monotonic_adjustment(self) -> None:
        adjusted = benjamini_hochberg([0.01, 0.04, 0.03, 0.002, 1.0])

        np.testing.assert_allclose(adjusted, [0.025, 0.05, 0.05, 0.01, 1.0])

    def test_benjamini_hochberg_treats_non_finite_as_not_significant(self) -> None:
        adjusted = benjamini_hochberg([float("nan"), float("inf"), 0.01])

        self.assertEqual(adjusted[0], 1.0)
        self.assertEqual(adjusted[1], 1.0)
        self.assertAlmostEqual(adjusted[2], 0.03)

    def test_rank_biserial_direction_is_interpretable(self) -> None:
        self.assertEqual(rank_biserial_from_u(16, 4, 4), 1.0)
        self.assertEqual(rank_biserial_from_u(0, 4, 4), -1.0)
        self.assertEqual(rank_biserial_from_u(8, 4, 4), 0.0)


if __name__ == "__main__":
    unittest.main()
