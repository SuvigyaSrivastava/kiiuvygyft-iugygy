from datetime import date

import pytest

from backend.app.domain.timeutil import cutoff_utc, half_hour_targets, parse_hhmm


def test_january_cutoff_equals_utc():
    assert cutoff_utc(date(2026, 1, 14), "09:20").strftime("%Y-%m-%d %H:%M") == "2026-01-14 09:20"


def test_summer_cutoff_is_one_hour_earlier_in_utc():
    assert cutoff_utc(date(2026, 7, 14), "09:20").strftime("%H:%M") == "08:20"


def test_dst_days_have_46_and_50_half_hours():
    assert len(half_hour_targets(date(2026, 3, 29))) == 46
    assert len(half_hour_targets(date(2026, 10, 25))) == 50
    assert len(half_hour_targets(date(2026, 1, 15))) == 48


def test_bad_cutoff_text_is_rejected():
    with pytest.raises(ValueError):
        parse_hhmm("9am")
