"""Replace only Identity in an isolated baseline cluster and verify compatibility."""

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import uuid

os.environ.setdefault("E2E_PROJECT", "ticketbox-e2e-identity-" + uuid.uuid4().hex[:8])
os.environ.setdefault("E2E_PORT", "18206")

from split import BASE, PORT, PROJECT, ROOT, login, request, sql, until

SERVICES = ("identity", "catalog", "ticketing", "checkin", "payment", "notification")
SERVICE_TOKEN = "identity-swap-fixture-service-token-1234"


def compose(overlay, *args):
    return subprocess.check_output(
        ["docker", "compose", "-p", PROJECT, "-f", str(ROOT / "compose.yaml"), "-f", str(overlay), *args],
        cwd=ROOT, text=True, env={**os.environ, "APP_PORT": PORT, "APP_ALLOWED_ORIGINS": BASE,
                                "APP_PUBLIC_URL": BASE, "SPLIT_SERVICE_TOKEN": SERVICE_TOKEN,
                                "CHECKIN_PORT": os.environ.get("CHECKIN_PORT", str(int(PORT) + 1))},
    ).strip()


def write_overlay(path, identity_image):
    images = {service: f"ticketbox-{service}:ownership-baseline" for service in SERVICES}
    images["identity"] = identity_image
    path.write_text(json.dumps({"services": {service: {"image": image} for service, image in images.items()}}))


def claims(token):
    payload = token.split(".")[1]
    decoded = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    return {key: decoded[key] for key in ("sub", "email", "role", "fullName")}


def contact(overlay, user_id, token):
    js = """
    const [id, token] = process.argv.slice(1);
    const response = await fetch('http://identity:8080/internal/split/users/' + id, {
      headers: {'X-Service-Token': token},
    });
    console.log(JSON.stringify({status: response.status, body: response.ok ? await response.json() : null}));
    """
    return json.loads(compose(overlay, "exec", "-T", "smtp", "node", "--input-type=module", "-e", js, user_id, token))


def verify_roles(tokens):
    for service, path, allowed, denied in (
        ("catalog", "/api/admin/concerts", "admin", "audience"),
        ("ticketing", "/api/orders/my", "audience", "staff"),
        ("checkin", "/api/staff/concerts", "staff", "audience"),
    ):
        until(lambda: request("GET", path, tokens[allowed]) is not None)
        request("GET", path, tokens[denied], expected=(403,))
        print(f"{service}: authorized and forbidden roles verified")


def check_swap(overlay, candidate, proof):
    old = {"admin": until(lambda: login("admin"))}
    old.update({role: login(role) for role in ("organizer", "staff", "audience")})
    verify_roles(old)
    email = "identity-swap@example.com"
    password = "identity-swap-fixture-password"
    profile = request("POST", "/api/auth/register", body={
        "email": email, "password": password, "fullName": "Identity Swap Fixture", "phone": "0901234567",
    }, expected=(201,))
    user_id = str(uuid.UUID(profile["id"]))
    row_query = f"SELECT md5(to_jsonb(u)::text) FROM users u WHERE id = '{user_id}'"
    history_query = "SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank"
    row_before = sql("identity", row_query)
    history_before = sql("identity", history_query)
    assert row_before and history_before
    containers = {service: compose(overlay, "ps", "-q", service) for service in (*SERVICES, "identity-db", "gateway")}
    assert all(containers.values())
    baseline_contact = contact(overlay, user_id, SERVICE_TOKEN)
    assert baseline_contact == {"status": 200, "body": {
        "id": user_id, "email": email, "fullName": "Identity Swap Fixture",
    }}

    write_overlay(overlay, candidate)
    compose(overlay, "up", "-d", "--no-deps", "--no-build", "--pull", "never", "identity")
    current = compose(overlay, "ps", "-q", "identity")
    assert current and current != containers.pop("identity")
    expected_image = subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", candidate], text=True).strip()
    actual_image = subprocess.check_output(["docker", "inspect", "--format", "{{.Image}}", current], text=True).strip()
    assert expected_image == actual_image
    assert all(compose(overlay, "ps", "-q", service) == container for service, container in containers.items())

    until(lambda: request("GET", "/api/auth/me", old["admin"]))
    for role, token in old.items():
        assert request("GET", "/api/auth/me", token)["id"] == claims(token)["sub"]
    new = {role: login(role) for role in old}
    assert {role: claims(token) for role, token in new.items()} == {role: claims(token) for role, token in old.items()}
    verify_roles(new)
    proof["checks"].append("Baseline JWTs work after replacement and new JWTs preserve all claims and role rules")

    credentials = request("POST", "/api/auth/login", body={"email": email, "password": password})
    assert request("GET", "/api/users/me/profile", credentials["accessToken"])["id"] == user_id
    assert sql("identity", row_query) == row_before
    assert sql("identity", history_query) == history_before
    proof["checks"].append("The existing Identity DB, account row and Flyway history survive the image swap")

    assert contact(overlay, user_id, "incorrect-token")["status"] == 401
    assert contact(overlay, user_id, SERVICE_TOKEN) == baseline_contact
    proof["checks"].append("Internal lookup requires the service token and returns the original contact payload")
    proof["candidateImage"] = actual_image
    proof["checks"].append("Only Identity was replaced")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--identity-image", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    for resource, filter_arg in (("ps", "--all"), ("volume", "ls")):
        existing = subprocess.check_output(
            ["docker", resource, filter_arg, "--quiet", "--filter", f"label=com.docker.compose.project={PROJECT}"],
            text=True,
        )
        if existing.strip():
            parser.error(f"Compose project {PROJECT} already has resources")
    proof = {"passed": False, "project": PROJECT, "gatewayPort": PORT, "checks": []}
    with TemporaryDirectory() as directory:
        overlay = Path(directory) / "images.json"
        write_overlay(overlay, "ticketbox-identity:ownership-baseline")
        try:
            compose(overlay, "up", "-d", "--no-build", "--pull", "never", "gateway", "smtp")
            check_swap(overlay, args.identity_image, proof)
            proof["passed"] = True
        finally:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(proof, indent=2) + "\n")
            compose(overlay, "down", "--volumes")


if __name__ == "__main__":
    main()
