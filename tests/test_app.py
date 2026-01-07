"""
Unit tests on the main streamlit app

.. author:: Marek Ozana
.. date:: 2024-03
"""

import logging
import re

import pytest
from streamlit.testing.v1 import AppTest

DEFAULT_TIMEOUT = 30
STAT_LINE = re.compile(r"\* \*\*(.+?)\*\* = ([0-9.]+)%")


def _run_app(path: str) -> AppTest:
    at = AppTest.from_file(path, default_timeout=DEFAULT_TIMEOUT)
    at.run()
    return at


def _get_portfolio_stats(at: AppTest) -> dict[str, float]:
    assert at.markdown, "Expected the app to render portfolio stats."
    stats = {
        match.group(1): float(match.group(2))
        for match in STAT_LINE.finditer(at.markdown[0].value)
    }
    return stats


def _assert_portfolio_stats(
    at: AppTest,
    exp_return: float,
    exp_vol: float,
    *,
    message: str,
) -> None:
    assert not at.exception, message
    stats = _get_portfolio_stats(at)
    assert stats["Expected Return in 1y"] == pytest.approx(exp_return)
    assert stats["Expected volatility"] == pytest.approx(exp_vol)


def test_app():
    at = _run_app("app.py")
    assert not at.exception


def test_app_with_adjusted_r_min():
    at = _run_app("scripts/Markowitz.py")
    _assert_portfolio_stats(
        at,
        exp_return=6.0,
        exp_vol=2.4,
        message="The app should start without exceptions.",
    )

    # Set the r_min slider to 8%.
    r_min_slider = at.sidebar.slider[0]
    r_min_slider.set_value(8.0).run()  # Set to 8%

    # Verify that the app didn't throw an exception after the change.
    _assert_portfolio_stats(
        at,
        exp_return=7.5,
        exp_vol=12.4,
        message="The app should not throw after setting r_min to 8%.",
    )


def test_app_remove_tickers():
    at = _run_app("scripts/Markowitz.py")
    _assert_portfolio_stats(
        at,
        exp_return=6.0,
        exp_vol=2.4,
        message="The app should start without exceptions.",
    )

    at.sidebar.multiselect[0].unselect("Climate Focus").run()

    # Verify that the app didn't throw an exception after the change.
    _assert_portfolio_stats(
        at,
        exp_return=6.0,
        exp_vol=2.7,
        message="The app should not throw removing ticker.",
    )


def test_MicroFinanceAnalyzer_smoke_test(caplog):
    at = AppTest.from_file(
        "scripts/Micro_Finance_Analyzer.py", default_timeout=DEFAULT_TIMEOUT
    )

    with caplog.at_level(logging.DEBUG):
        at.run()
    assert not at.exception
    assert "Reading in data and calculating params" in caplog.text
    assert "Micro Finance Analyzer" in at.title[0].value


def test_MicroFinanceAnalyzer_page_switch():
    at = _run_app("app.py")
    at = at.switch_page(page_path="scripts/Micro_Finance_Analyzer.py")
    at.run()
    assert not at.exception


def test_HistoricalRiskReturn_smoke_test(caplog):
    at = AppTest.from_file(
        "scripts/Historical_Risk_Return.py", default_timeout=DEFAULT_TIMEOUT
    )

    with caplog.at_level(logging.DEBUG):
        at.run()
    assert not at.exception
    assert "Historical Risk Return Analysis" in at.title[0].value


def test_HistoricalRiskReturn_page_switch():
    at = _run_app("app.py")
    at = at.switch_page(page_path="scripts/Historical_Risk_Return.py")
    at.run()
    assert not at.exception
