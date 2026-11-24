#!/usr/bin/env bash
# Run Maven for the TicketBox services inside a Java 21 container, for hosts
# without a JDK 21. Arguments go to mvn unchanged, for example:
#   scripts/mvnw-docker.sh -B -ntp -f services/payment/pom.xml verify
#   scripts/mvnw-docker.sh -f services/payment/pom.xml test -Dtest=PaymentIntegrationTest
# Testcontainers starts its databases and brokers beside this container through
# the host Docker socket. Build output stays owned by the calling user.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${TICKETBOX_MAVEN_IMAGE:-maven:3.9.9-eclipse-temurin-21}"
socket="/var/run/docker.sock"
if [[ "${DOCKER_HOST:-}" == unix://* ]]; then socket="${DOCKER_HOST#unix://}"; fi
if [[ ! -S "$socket" ]]; then
  echo "mvnw-docker: Docker socket not found at $socket. Start Docker or set DOCKER_HOST." >&2
  exit 1
fi

# Keep relative paths such as -f services/x/pom.xml working from any directory in the repo.
workdir="$PWD"
case "$workdir/" in "$repo"/*) ;; *) workdir="$repo" ;; esac

maven_home="${TICKETBOX_MAVEN_HOME:-$HOME/.m2}"
mkdir -p "$maven_home"

tty=(-i)
if [[ -t 0 && -t 1 ]]; then tty=(-it); fi

exec docker run --rm --init "${tty[@]}" \
  --security-opt label=disable \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c %g "$socket")" \
  --add-host host.docker.internal:host-gateway \
  -v "$socket:/var/run/docker.sock" \
  -v "$repo:$repo" -w "$workdir" \
  -v "$maven_home:/var/maven/.m2" -e MAVEN_CONFIG=/var/maven/.m2 \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  -e JWT_SECRET="${JWT_SECRET:-ticketbox-test-fixture-secret-with-at-least-sixty-four-characters-local-only}" \
  "$image" mvn -Duser.home=/var/maven "$@"
