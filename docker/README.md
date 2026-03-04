# pgCompare Container

## Build Container

For building instructions, see the comments in the `Dockerfile`.

### Multi-stage Build (recommended)
```shell
docker build --target multi-stage -t pgcompare:latest .
```

### Local Build (requires pre-built artifacts)
```shell
# First build the Java and UI artifacts
mvn clean install
cd ui && npm ci && npm run build && cd ..

# Then build the container
docker build --target local -t pgcompare:latest .
```

## Container Modes

The container supports multiple operational modes controlled by the `PGCOMPARE_MODE` environment variable:

| Mode | Description |
|------|-------------|
| `standard` | (Default) Runs the Java application with `PGCOMPARE_OPTIONS` |
| `server` | Runs the Java application in server mode for distributed processing |
| `ui` | Runs only the Next.js web UI |
| `all` | Runs both the Java server and the Next.js UI |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PGCOMPARE_MODE` | Container operation mode | `standard` |
| `PGCOMPARE_OPTIONS` | CLI options for standard mode | `--batch 0 --project 1` |
| `PGCOMPARE_SERVER_NAME` | Server name for server/all modes | Container hostname |
| `PGCOMPARE_CONFIG` | Path to properties file | `/etc/pgcompare/pgcompare.properties` |
| `PORT` | Port for the UI (ui/all modes) | `3000` |
| `DATABASE_URL` | PostgreSQL connection for UI | Required for ui/all modes |

## Usage Examples

### Standard Mode (default)
Run a comparison batch:
```shell
docker run --name pgcompare \
   -v /path/to/pgcompare.properties:/etc/pgcompare/pgcompare.properties \
   -e PGCOMPARE_OPTIONS="--batch 0 --project 1" \
   pgcompare:latest
```

### Server Mode
Run as a worker server for distributed comparisons:
```shell
docker run --name pgcompare-server \
   -v /path/to/pgcompare.properties:/etc/pgcompare/pgcompare.properties \
   -e PGCOMPARE_MODE=server \
   -e PGCOMPARE_SERVER_NAME=worker-1 \
   pgcompare:latest
```

### UI Mode
Run only the web interface:
```shell
docker run --name pgcompare-ui \
   -p 3000:3000 \
   -e PGCOMPARE_MODE=ui \
   -e DATABASE_URL="postgresql://user:pass@host:5432/pgcompare" \
   pgcompare:latest
```

### All Mode
Run both server and UI together:
```shell
docker run --name pgcompare-all \
   -p 3000:3000 \
   -v /path/to/pgcompare.properties:/etc/pgcompare/pgcompare.properties \
   -e PGCOMPARE_MODE=all \
   -e DATABASE_URL="postgresql://user:pass@host:5432/pgcompare" \
   pgcompare:latest
```

## Docker Compose Example

```yaml
version: '3.8'

services:
  pgcompare-db:
    image: postgres:16
    environment:
      POSTGRES_USER: pgcompare
      POSTGRES_PASSWORD: pgcompare
      POSTGRES_DB: pgcompare
    volumes:
      - pgcompare-data:/var/lib/postgresql/data

  pgcompare:
    image: pgcompare:latest
    ports:
      - "3000:3000"
    environment:
      PGCOMPARE_MODE: all
      DATABASE_URL: postgresql://pgcompare:pgcompare@pgcompare-db:5432/pgcompare
    volumes:
      - ./pgcompare.properties:/etc/pgcompare/pgcompare.properties
    depends_on:
      - pgcompare-db

volumes:
  pgcompare-data:
```
