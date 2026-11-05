#!/usr/bin/env python3
"""Build one TicketBox service and check its resolved and packaged boundaries."""

import argparse
from io import BytesIO
import json
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

SERVICE_PACKAGES = {
    "identity": "org/ticketbox/identity/",
    "catalog": "org/ticketbox/catalog/",
    "checkin": "org/ticketbox/checkin/",
    "ticketing": "org/ticketbox/ticketing/",
    "payment": "com/ticketbox/payments/",
    "notification": "com/ticketbox/notifications/",
}
MAVEN_IMAGE = "maven:3.9.9-eclipse-temurin-21"
TREE_GOAL = "org.apache.maven.plugins:maven-dependency-plugin:3.8.1:tree"
APP_CLASSES = "BOOT-INF/classes/"
APP_LIBS = "BOOT-INF/lib/"


class BoundaryError(Exception):
    pass


def forbidden_artifacts(service):
    return {"service-runtime", "ticketbox-api"} | {
        f"{other}-service" for other in SERVICE_PACKAGES if other != service
    }


def verify_dependencies(service, tree):
    if (tree["groupId"], tree["artifactId"]) != ("com.ticketbox", f"{service}-service"):
        raise BoundaryError(f"Unexpected Maven project in dependency tree for {service}")
    forbidden = forbidden_artifacts(service)
    pending = [(child, f"com.ticketbox:{service}-service") for child in tree.get("children", [])]
    while pending:
        dependency, parent = pending.pop()
        group = dependency["groupId"]
        artifact = dependency["artifactId"]
        chain = f"{parent} -> {group}:{artifact}"
        if group == "com.ticketbox" and artifact in forbidden:
            raise BoundaryError(f"Forbidden Maven dependency: {chain}")
        pending.extend((child, chain) for child in dependency.get("children", []))


def verify_classes(entries, own_package, location):
    for entry in entries:
        if not entry.endswith(".class"):
            continue
        class_path = re.sub(r"^META-INF/versions/[0-9]+/", "", entry)
        if class_path.startswith(("com/ticketbox/", "org/ticketbox/")) and not class_path.startswith(own_package):
            raise BoundaryError(f"Foreign TicketBox class in {location}: {class_path}")


def verify_jar(service, jar_path):
    own_package = SERVICE_PACKAGES[service]
    forbidden = forbidden_artifacts(service)
    with ZipFile(jar_path) as app:
        entries = app.namelist()
        classes = [entry.removeprefix(APP_CLASSES) for entry in entries if entry.startswith(APP_CLASSES)]
        verify_classes(classes, own_package, "BOOT-INF/classes")
        if not any(entry.startswith(own_package) and entry.endswith(".class") for entry in classes):
            raise BoundaryError(f"No {service} application classes under BOOT-INF/classes")

        for entry in entries:
            if not entry.startswith(APP_LIBS) or not entry.endswith(".jar"):
                continue
            filename = entry.removeprefix(APP_LIBS)
            for artifact in sorted(forbidden):
                if filename == f"{artifact}.jar" or re.match(rf"{artifact}-[0-9]", filename):
                    raise BoundaryError(f"Forbidden packaged artifact in {entry}: {artifact}")
            # Inspect every nested JAR so renamed or shaded TicketBox classes are also checked.
            with ZipFile(BytesIO(app.read(entry))) as library:
                metadata = set(library.namelist())
                for artifact in sorted(forbidden):
                    if f"META-INF/maven/com.ticketbox/{artifact}/pom.properties" in metadata:
                        raise BoundaryError(f"Forbidden packaged artifact in {entry}: com.ticketbox:{artifact}")
                verify_classes(sorted(metadata), own_package, entry)


def run_step(description, command, capture=False):
    print(description, flush=True)
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE if capture else None)
    if result.returncode:
        raise BoundaryError(f"{description} failed (exit {result.returncode})")
    return result.stdout


def check_service(service, context):
    tag = f"ticketbox-boundary-{service}:{uuid4().hex}"
    run_step(
        f"Build {service} with Docker context services/{service}",
        ["docker", "build", "--no-cache", "--tag", tag, str(context)],
    )
    try:
        tree = run_step(
            f"Resolve Maven dependencies for {service} in a clean container",
            ["docker", "run", "--rm", "--mount", f"type=bind,source={context},target=/workspace,readonly",
             "--workdir", "/workspace", MAVEN_IMAGE, "sh", "-ec",
             f"mvn -B -ntp {TREE_GOAL} -DoutputType=json -DoutputFile=/tmp/tree.json >&2; cat /tmp/tree.json"],
            capture=True,
        )
        verify_dependencies(service, json.loads(tree))

        container = run_step(f"Create inspection container for {service}", ["docker", "create", tag], capture=True).strip()
        try:
            with TemporaryDirectory() as directory:
                jar = Path(directory) / "app.jar"
                run_step(f"Copy /app/app.jar from {service} image", ["docker", "cp", f"{container}:/app/app.jar", str(jar)])
                verify_jar(service, jar)
        finally:
            subprocess.run(["docker", "rm", container], stdout=subprocess.DEVNULL, check=False)
    finally:
        subprocess.run(["docker", "image", "rm", tag], stdout=subprocess.DEVNULL, check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", required=True, choices=SERVICE_PACKAGES)
    service = parser.parse_args().service
    context = Path(__file__).resolve().parents[2] / "services" / service
    try:
        check_service(service, context)
    except (BoundaryError, BadZipFile, OSError, ValueError, KeyError, TypeError) as error:
        print(f"{service}: {error}", file=sys.stderr)
        return 1
    print(f"{service}: independent build and ownership checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
