from pathlib import Path
import unittest


class E2EArtifactsTest(unittest.TestCase):
    def test_workflow_uploads_only_named_e2e_reports(self):
        workflow = Path(__file__).resolve().parents[2] / ".github/workflows/verify.yml"
        paths = {
            line.strip()
            for line in workflow.read_text().splitlines()
            if line.strip().startswith(".artifacts/e2e/")
        }
        self.assertEqual(paths, {
            ".artifacts/e2e/checkout/results.json",
            ".artifacts/e2e/split-journey.json",
            ".artifacts/e2e/split-restore.json",
        })
