"""Require the named Java suites and cases in fresh Maven Surefire reports."""

import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

FIELDS = ("tests", "failures", "errors", "skipped")


def verify_reports(reports, required_groups):
    suites = {}
    cases = {}
    for path in sorted(reports.glob("TEST-*.xml")):
        suite = ET.parse(path).getroot()
        name = suite.attrib["name"]
        totals = {field: int(suite.attrib[field]) for field in FIELDS}
        if totals["tests"] <= 0 or any(totals[field] for field in FIELDS[1:]):
            raise ValueError(f"{name} must pass without failures, errors or skipped tests: {totals}")
        suites[name] = totals
        cases[name] = {case.attrib["name"] for case in suite.findall("testcase")}
    if not suites:
        raise ValueError(f"No Surefire reports in {reports}")

    for group, required in required_groups.items():
        for name, methods in required.items():
            if name not in suites:
                raise ValueError(f"{group}: missing {name}")
            for method in methods:
                if method not in cases[name]:
                    raise ValueError(f"{group}: missing {name}.{method}")

    return {
        "requiredGroups": required_groups,
        "totals": {field: sum(suite[field] for suite in suites.values()) for field in FIELDS},
        "suites": [{"name": name, **totals} for name, totals in suites.items()],
    }


def main():
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads(Path(__file__).with_name("java-suites.json").read_text(encoding="utf8"))
    results = {}
    for module, configuration in manifest.items():
        try:
            results[module] = verify_reports(root / configuration["reports"], configuration["requiredGroups"])
        except (ET.ParseError, KeyError, OSError, ValueError) as error:
            print(f"{module}: {error}", file=sys.stderr)
            return 1
    print(json.dumps(results))
    return 0


if __name__ == "__main__":
    sys.exit(main())
