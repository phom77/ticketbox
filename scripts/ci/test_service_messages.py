import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVICES = ("identity", "catalog", "checkin", "ticketing", "payment", "notification")
VIETNAMESE_MARKS = re.compile(r"[ĐđĂăƠơƯư\u1ea0-\u1ef9àáâèéêìíòóôùúỳý]", re.IGNORECASE)
INPUT_PATTERN = re.compile(r'^\s*(?:\+\s*)?"(?:\(\?i|•\]| si\|nghệ sĩ\|| dạng\)\|)')
KEY = re.compile(
    r'"\{?((?:error|validation|response|checkin|guest-import|artist-bio|display|'
    r'notification\.(?:payment|reminder))\.[a-z][a-z0-9.-]*)\}?"'
)
PLACEHOLDER = re.compile(r"\{([a-zA-Z0-9]+)(?:,[^{}]+)?\}")


def java_sources(service):
    return (ROOT / "services" / service / "src/main/java").rglob("*.java")


class ServiceMessagesTest(unittest.TestCase):
    def read_bundle(self, path):
        entries = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.lstrip().startswith(("#", "!")):
                continue
            key, value = line.split("=", 1)
            self.assertNotIn(key, entries, f"Duplicate key in {path}: {key}")
            self.assertTrue(value.strip(), f"Empty value in {path}: {key}")
            entries[key] = value
        return entries

    def test_required_keys_and_placeholders_match_in_english_and_vietnamese(self):
        for service in SERVICES:
            with self.subTest(service=service):
                resources = ROOT / "services" / service / "src/main/resources"
                base = resources / "messages.properties"
                vietnamese = resources / "messages_vi.properties"
                en = self.read_bundle(base) if service != "payment" or base.exists() else {}
                if en:
                    self.assertTrue(vietnamese.is_file(), f"Missing Vietnamese bundle for {service}")
                for path in resources.glob("messages_*.properties"):
                    translated = self.read_bundle(path)
                    if path == vietnamese:
                        self.assertEqual(en.keys(), translated.keys())
                    self.assertFalse(translated.keys() - en.keys(), f"Unknown message keys in {path}")
                    for key, value in translated.items():
                        self.assertEqual(
                            set(PLACEHOLDER.findall(en[key])), set(PLACEHOLDER.findall(value)),
                            f"{path.name}: {key}",
                        )

                used = set()
                for path in java_sources(service):
                    used.update(KEY.findall(path.read_text(encoding="utf-8")))
                missing = used - en.keys()
                self.assertFalse(missing, f"Missing message keys: {sorted(missing)}")

    def test_vietnamese_copy_lives_in_resources(self):
        findings = []
        for service in SERVICES:
            for path in java_sources(service):
                for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                    if not VIETNAMESE_MARKS.search(line):
                        continue
                    # The artist bio feature recognizes Vietnamese source material.
                    if (service == "catalog"
                            and path.name in {"ArtistBioComposerService.java", "MockArtistBioGenerator.java"}
                            and INPUT_PATTERN.match(line)):
                        continue
                    findings.append(f"{path.relative_to(ROOT)}:{number}")
        self.assertFalse(findings, "Vietnamese text in production Java:\n" + "\n".join(findings))
