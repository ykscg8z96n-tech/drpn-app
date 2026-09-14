#!/usr/bin/env bash
# backend/scripts/atlas-setup.sh
#
# Scripts the MongoDB Atlas setup this repo needs: an M0 cluster, a
# database user scoped to one database, and a network access rule -
# so you never have to click through the dashboard for this again
# (e.g. after deleting/recreating a cluster).
#
# Requires the Atlas CLI (`brew install mongodb-atlas-cli` or see
# https://www.mongodb.com/docs/atlas/cli/current/install-atlas-cli/)
# and an Atlas API key with Project Owner access on the target project:
# Atlas dashboard -> Access Manager -> your project -> Create API Key.
#
# Usage:
#   export ATLAS_PUBLIC_KEY=...
#   export ATLAS_PRIVATE_KEY=...
#   export ATLAS_PROJECT_ID=...       # Project Settings -> Project ID
#   ./atlas-setup.sh drpn             # cluster name of your choice
#
# Nothing here is idempotent by design - re-running against a project
# that already has these resources will fail loudly rather than
# silently doing the wrong thing. Delete the old ones first if
# you're recreating.

set -euo pipefail

CLUSTER_NAME="${1:?Usage: $0 <cluster-name>}"
DB_NAME="drpn"
DB_USER="drpn_app"

: "${ATLAS_PUBLIC_KEY:?Set ATLAS_PUBLIC_KEY (Atlas API key)}"
: "${ATLAS_PRIVATE_KEY:?Set ATLAS_PRIVATE_KEY (Atlas API key)}"
: "${ATLAS_PROJECT_ID:?Set ATLAS_PROJECT_ID (Project Settings -> Project ID)}"

if ! command -v atlas >/dev/null 2>&1; then
  echo "Atlas CLI not found. Install it first:" >&2
  echo "  https://www.mongodb.com/docs/atlas/cli/current/install-atlas-cli/" >&2
  exit 1
fi

export MONGODB_ATLAS_PUBLIC_API_KEY="$ATLAS_PUBLIC_KEY"
export MONGODB_ATLAS_PRIVATE_API_KEY="$ATLAS_PRIVATE_KEY"

echo "==> Creating M0 cluster '$CLUSTER_NAME' (this takes a few minutes)..."
atlas clusters create "$CLUSTER_NAME" \
  --projectId "$ATLAS_PROJECT_ID" \
  --provider AWS \
  --region US_EAST_1 \
  --tier M0

echo "==> Waiting for cluster to become IDLE (ready)..."
atlas clusters watch "$CLUSTER_NAME" --projectId "$ATLAS_PROJECT_ID"

DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"

echo "==> Creating database user '$DB_USER' scoped to database '$DB_NAME'..."
atlas dbusers create \
  --projectId "$ATLAS_PROJECT_ID" \
  --username "$DB_USER" \
  --password "$DB_PASSWORD" \
  --role "readWrite@${DB_NAME}"

echo "==> Allowing network access (0.0.0.0/0 - fine for a small pre-launch"
echo "    app reached only via a secret-bearing connection string; move to"
echo "    Render's static outbound IPs, a paid plan feature, once you're past this stage)..."
atlas accessLists create \
  --projectId "$ATLAS_PROJECT_ID" \
  --type ipAddress \
  --currentIp=false \
  0.0.0.0/0 \
  --comment "Temporary - open access for pre-launch testing"

echo "==> Fetching connection string..."
CONN_STRING=$(atlas clusters connectionStrings describe "$CLUSTER_NAME" \
  --projectId "$ATLAS_PROJECT_ID" \
  --output json | grep -o '"standardSrv":"[^"]*"' | cut -d'"' -f4)

# Splice the credentials into the srv connection string and select the db.
FULL_URI="${CONN_STRING/mongodb+srv:\/\//mongodb+srv://${DB_USER}:${DB_PASSWORD}@}"
FULL_URI="${FULL_URI}/${DB_NAME}?retryWrites=true&w=majority"

echo ""
echo "==================================================================="
echo "Done. Set this as MONGODB_URI (in backend/.env and in Render):"
echo ""
echo "$FULL_URI"
echo "==================================================================="
echo ""
echo "This value is only printed here - it is not saved to any file by"
echo "this script. Copy it now."
