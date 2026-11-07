import tempfile
import unittest
from pathlib import Path

from java_reports import verify_reports


class JavaReportsTest(unittest.TestCase):
    def test_missing_required_case_fails_even_when_suite_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            reports = Path(directory)
            (reports / "TEST-example.ProjectionTest.xml").write_text(
                '<testsuite name="example.ProjectionTest" tests="1" failures="0" errors="0" skipped="0">'
                '<testcase name="appliesSnapshot"/></testsuite>', encoding="utf8")
            with self.assertRaisesRegex(ValueError, "projection: missing example.ProjectionTest.rollback"):
                verify_reports(reports, {"projection": {"example.ProjectionTest": ["rollback"]}})

    def test_skipped_tests_fail_even_when_the_required_case_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            reports = Path(directory)
            (reports / "TEST-example.ProjectionTest.xml").write_text(
                '<testsuite name="example.ProjectionTest" tests="1" failures="0" errors="0" skipped="1">'
                '<testcase name="rollback"><skipped/></testcase></testsuite>', encoding="utf8")
            with self.assertRaisesRegex(ValueError, "example.ProjectionTest.*skipped"):
                verify_reports(reports, {"projection": {"example.ProjectionTest": ["rollback"]}})

    def test_valid_suite_preserves_counts_and_required_groups(self):
        with tempfile.TemporaryDirectory() as directory:
            reports = Path(directory)
            (reports / "TEST-example.ProjectionTest.xml").write_text(
                '<testsuite name="example.ProjectionTest" tests="1" failures="0" errors="0" skipped="0">'
                '<testcase name="rollback"/></testsuite>', encoding="utf8")
            groups = {"projection": {"example.ProjectionTest": ["rollback"]}}
            report = verify_reports(reports, groups)
            self.assertEqual(report["requiredGroups"], groups)
            self.assertEqual(report["totals"], {"tests": 1, "failures": 0, "errors": 0, "skipped": 0})
