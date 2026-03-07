# REQUIRED FILES TO BUILD THIS IMAGE
# ----------------------------------
# (1) target/*
#     See the main README.md file for instructions on compiling.  The compiled version is placed
#     into the target directory by default.
#
# HOW TO BUILD THIS IMAGE
# -----------------------
# Compile code:
#      $ mvn install
# Build Docker Image:
#      $ docker build -t {tag} .
#
# Pull base image
# ---------------
ARG MAVEN_VERSION=3.9.9
ARG NODE_VERSION=20
ARG BASE_REGISTRY=registry.access.redhat.com/ubi8
ARG BASE_IMAGE=ubi-minimal
ARG JAVA_OPT="-XX:UseSVE=0"

#############################################
# Stage 1: Build Java Application
#############################################
FROM docker.io/library/maven:${MAVEN_VERSION} AS java-builder
LABEL stage=pgcomparebuilder

WORKDIR /app
COPY pom.xml ./
COPY src ./src

RUN mvn clean install -DskipTests

#############################################
# Stage 2: Build Next.js UI
#############################################
FROM docker.io/library/node:${NODE_VERSION}-alpine AS ui-builder

WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci

COPY ui/ ./
RUN npm run build

#############################################
# Stage 3: Multi-stage Production Image
#############################################
FROM ${BASE_REGISTRY}/${BASE_IMAGE} AS multi-stage
ARG JAVA_OPT
ARG NODE_VERSION
ARG TARGETARCH

RUN microdnf install java-21-openjdk tar xz -y && microdnf clean all

RUN NODE_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "x64") && \
    curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}.9.0/node-v${NODE_VERSION}.9.0-linux-${NODE_ARCH}.tar.xz | tar -xJ -C /usr/local --strip-components=1

USER 0

RUN mkdir -p /opt/pgcompare/ui /opt/pgcompare/lib \
    && chown -R 1001:1001 /opt/pgcompare

COPY docker/start.sh /opt/pgcompare/
COPY docker/pgcompare.properties /etc/pgcompare/
COPY --from=java-builder /app/target/*.jar /opt/pgcompare/
COPY --from=java-builder /app/target/lib/ /opt/pgcompare/lib/

COPY --from=ui-builder /app/ui/.next/standalone/ /opt/pgcompare/ui/
COPY --from=ui-builder /app/ui/.next/static /opt/pgcompare/ui/.next/static
COPY --from=ui-builder /app/ui/public /opt/pgcompare/ui/public

RUN chmod 770 /opt/pgcompare/start.sh \
    && chown -R 1001:1001 /opt/pgcompare

USER 1001

ENV PGCOMPARE_HOME=/opt/pgcompare \
    PGCOMPARE_CONFIG=/etc/pgcompare/pgcompare.properties \
    PGCOMPARE_MODE=standard \
    PATH=/opt/pgcompare:$PATH \
    _JAVA_OPTIONS=${JAVA_OPT} \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["start.sh"]

WORKDIR "/opt/pgcompare"

#############################################
# Stage 4: Local Platform Build
#############################################
FROM ${BASE_REGISTRY}/${BASE_IMAGE} AS local
ARG JAVA_OPT
ARG NODE_VERSION
ARG TARGETARCH

RUN microdnf install java-21-openjdk tar xz -y && microdnf clean all

RUN NODE_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "x64") && \
    curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}.9.0/node-v${NODE_VERSION}.9.0-linux-${NODE_ARCH}.tar.xz | tar -xJ -C /usr/local --strip-components=1

USER 0

RUN mkdir -p /opt/pgcompare/ui /opt/pgcompare/lib \
    && chown -R 1001:1001 /opt/pgcompare

COPY docker/start.sh /opt/pgcompare/
COPY docker/pgcompare.properties /etc/pgcompare/
COPY target/*.jar /opt/pgcompare/
COPY target/lib/ /opt/pgcompare/lib/

COPY ui/.next/standalone/ /opt/pgcompare/ui/
COPY ui/.next/static /opt/pgcompare/ui/.next/static
COPY ui/public /opt/pgcompare/ui/public

RUN chmod 770 /opt/pgcompare/start.sh \
    && chown -R 1001:1001 /opt/pgcompare

USER 1001

ENV PGCOMPARE_HOME=/opt/pgcompare \
    PGCOMPARE_CONFIG=/etc/pgcompare/pgcompare.properties \
    PGCOMPARE_MODE=standard \
    PATH=/opt/pgcompare:$PATH \
    _JAVA_OPTIONS=${JAVA_OPT} \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["start.sh"]

WORKDIR "/opt/pgcompare"
