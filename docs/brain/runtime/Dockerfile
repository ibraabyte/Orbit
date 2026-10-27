FROM ghcr.io/basicmachines-co/basic-memory@sha256:61b168d6211a52c028fe70b5eaf5af814b2d11622d66482adefd02b4cac60b89
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY bd /usr/local/bin/bd
USER appuser
WORKDIR /runtime/beads
