import io
from pathlib import Path
import runpy
import tempfile
import unittest
from zipfile import ZipFile

gate = runpy.run_path(str(Path(__file__).with_name("verify-service-boundaries.py")))
BoundaryError = gate["BoundaryError"]


class ServiceBoundariesTest(unittest.TestCase):
    def test_rejects_transitive_runtime_and_other_services(self):
        for artifact in ("service-runtime", "notification-service", "ticketbox-api"):
            with self.subTest(artifact=artifact):
                tree = {
                    "groupId": "com.ticketbox", "artifactId": "payment-service",
                    "children": [{
                        "groupId": "example", "artifactId": "bridge",
                        "children": [{"groupId": "com.ticketbox", "artifactId": artifact}],
                    }],
                }
                with self.assertRaisesRegex(BoundaryError, f"com.ticketbox:{artifact}"):
                    gate["verify_dependencies"]("payment", tree)

    def test_accepts_own_classes_and_external_dependencies(self):
        self.check_jar({
            "BOOT-INF/classes/com/ticketbox/payments/PaymentsApplication.class": b"",
            "BOOT-INF/lib/vendor-1.jar": self.jar_bytes({"vendor/Sdk.class": b""}),
        })

    def test_rejects_foreign_classes_in_application_jar(self):
        for class_path in ("com/ticketbox/module/auth/AuthService.class",
                           "org/ticketbox/split/SplitCommon.class",
                           "org/ticketbox/identity/IdentityApplication.class",
                           "com/ticketbox/notifications/NotificationApplication.class"):
            with self.subTest(class_path=class_path):
                with self.assertRaisesRegex(BoundaryError, class_path):
                    self.check_jar({
                        "BOOT-INF/classes/com/ticketbox/payments/PaymentsApplication.class": b"",
                        f"BOOT-INF/classes/{class_path}": b"",
                    })

    def test_rejects_foreign_classes_in_renamed_nested_jar(self):
        with self.assertRaisesRegex(BoundaryError, "bridge-1.jar.*org/ticketbox/identity"):
            self.check_jar({
                "BOOT-INF/classes/com/ticketbox/payments/PaymentsApplication.class": b"",
                "BOOT-INF/lib/bridge-1.jar": self.jar_bytes({
                    "META-INF/versions/21/org/ticketbox/identity/IdentityApplication.class": b"",
                }),
            })

    def test_rejects_nested_application_artifact_by_maven_metadata(self):
        with self.assertRaisesRegex(BoundaryError, "notification-service"):
            self.check_jar({
                "BOOT-INF/classes/com/ticketbox/payments/PaymentsApplication.class": b"",
                "BOOT-INF/lib/bridge-1.jar": self.jar_bytes({
                    "META-INF/maven/com.ticketbox/notification-service/pom.properties": b"",
                }),
            })

    def check_jar(self, entries):
        with tempfile.TemporaryDirectory() as directory:
            jar = Path(directory) / "app.jar"
            jar.write_bytes(self.jar_bytes(entries))
            gate["verify_jar"]("payment", jar)

    @staticmethod
    def jar_bytes(entries):
        buffer = io.BytesIO()
        with ZipFile(buffer, "w") as jar:
            for path, contents in entries.items():
                jar.writestr(path, contents)
        return buffer.getvalue()


if __name__ == "__main__":
    unittest.main()
