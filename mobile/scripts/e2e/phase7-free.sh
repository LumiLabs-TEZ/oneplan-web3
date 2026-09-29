#!/usr/bin/env bash
# Fixture / fault helpers for the Phase 7 free-user Maestro flows (local API :3000, Postgres :5433).
# Usage: scripts/e2e/phase7-free.sh <command> [args]
#   free | pro                      flip user 80 (spike) between free and Pro (pro_monthly)
#   sparks <n>                      set spike's Spark balance to exactly n via e2e ledger rows
#   unacquire <listingId>           drop spike's acquisition of a listing so Apply is a real unlock
#   requests-reset                  delete spike's trip requests (request-conflict flow precondition)
#   server-bad-bucket | server-restore
#                                   restart the :3000 server with a nonexistent GCS bucket / normally
#   token                           print a fresh access token for spike (email login)
#   redeem-402 <listingId>          POST /missions/redeem and print the HTTP status + body
#   run <flow.yaml>                 maestro test on the iPhone 17 simulator
#   suite [logdir]                  run all six flows with their setup + verification (user ends Pro)
#   verify-<spark|insufficient|request|upload|offline|links>  print the DB rows each flow asserts on
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SERVER="$ROOT/server"
PGURL="$(grep -E '^DATABASE_URL' "$SERVER/.env" | cut -d= -f2- | tr -d '"' | sed 's/?schema=.*//')"
export PGOPTIONS='-c search_path=oneplandb'
API="${API_URL:-http://localhost:3000}"
SIM="${SIM_UDID:-370DE19F-D4A3-4E40-A22A-14CD55A3B3BA}"
USER_ID=80
sql() { psql "$PGURL" -Atc "$1"; }

balance() { sql "select coalesce((select sum(reward_amount) from mission_completion where user_id=$USER_ID),0) - coalesce((select sum(price) from reward_redemption where user_id=$USER_ID),0)"; }

case "${1:-}" in
  sleep-stale) sleep 65 ;;
  free)
    sql "update \"user\" set subscription_status='NONE', subscription_product_id=null, subscription_expires_at=null, auto_renew_enabled=false, grace_period_expires_at=null where id=$USER_ID"
    sql "select id,subscription_status,subscription_product_id from \"user\" where id=$USER_ID" ;;
  pro)
    sql "update \"user\" set subscription_status='ACTIVE', subscription_product_id='pro_monthly', subscription_expires_at=now()+interval '30 days', auto_renew_enabled=true where id=$USER_ID"
    sql "select id,subscription_status,subscription_product_id,subscription_expires_at from \"user\" where id=$USER_ID" ;;
  sparks)
    target="${2:?n}"
    sql "delete from mission_completion where user_id=$USER_ID and external_ref like 'e2e-%'"
    sql "delete from reward_redemption where user_id=$USER_ID and item_id='e2e_drain'"
    cur="$(balance)"
    if (( target > cur )); then
      sql "insert into mission_completion (user_id, mission_id, reward_amount, external_ref) values ($USER_ID,'friend_joined',$((target-cur)),'e2e-topup')"
    elif (( target < cur )); then
      sql "insert into reward_redemption (user_id, item_id, price) values ($USER_ID,'e2e_drain',$((cur-target)))"
    fi
    echo "balance=$(balance)" ;;
  unacquire)
    sql "delete from marketplace_acquisition where user_id=$USER_ID and listing_id=${2:?listingId}"
    sql "select listing_id from marketplace_acquisition where user_id=$USER_ID order by listing_id" | tr '\n' ' '; echo ;;
  requests-reset)
    sql "delete from trip_request where user_id=$USER_ID"; echo "trip_request rows: $(sql "select count(*) from trip_request where user_id=$USER_ID")" ;;
  server-bad-bucket|server-restore)
    pid="$(lsof -nP -tiTCP:3000 -sTCP:LISTEN || true)"
    [ -n "$pid" ] && kill "$pid" && sleep 2
    if [ "$1" = server-bad-bucket ]; then
      (cd "$SERVER" && GCS_MEDIA_BUCKET=oneplan-e2e-missing-bucket nohup node --enable-source-maps dist/src/main > /tmp/phase7-server-badbucket.log 2>&1 &)
    else
      (cd "$SERVER" && nohup node --enable-source-maps dist/src/main > /tmp/phase7-server.log 2>&1 &)
    fi
    for _ in $(seq 1 40); do curl -sf "$API/health/live" >/dev/null 2>&1 && { echo "server up ($1)"; exit 0; }; sleep 1; done
    echo "server did not come up"; exit 1 ;;
  token)
    curl -s "$API/auth/login" -H 'content-type: application/json' -d '{"email":"spike@oneplan.local","password":"SpikePass123!"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])' ;;
  redeem-402)
    tok="$("$0" token)"
    curl -s -o /tmp/phase7-redeem.json -w 'HTTP %{http_code}\n' "$API/missions/redeem" -H "authorization: Bearer $tok" -H 'content-type: application/json' -d "{\"itemId\":\"market_unlock\",\"listingId\":${2:?listingId}}"
    cat /tmp/phase7-redeem.json; echo ;;
  run)
    export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
    cd "$ROOT/mobile" && maestro --device "$SIM" test "${2:?flow}" ;;
  suite)
    logdir="${2:-/tmp/phase7-free-suite}"; mkdir -p "$logdir"; fails=0
    step() { # name, flow, setup...
      name="$1"; flow="$2"; shift 2
      for cmd in "$@"; do eval "$0 $cmd" >> "$logdir/$name.setup.txt" 2>&1; done
      if "$0" run "$flow" > "$logdir/$name.log" 2>&1; then echo "PASS $name"; else echo "FAIL $name (see $logdir/$name.log)"; fails=$((fails+1)); fi
    }
    # `GET /subscription/status` is persisted with a 60 s staleTime: give the cached Pro tier time to
    # expire after flipping the DB, or Apply takes the Pro path and the unlock sheet never shows.
    step spark .maestro/phase7-free-spark.yaml free "unacquire 2" "sparks 90" "sleep-stale"; "$0" verify-spark > "$logdir/spark.verify.txt"
    step insufficient .maestro/phase7-free-insufficient.yaml "unacquire 3" "sparks 10"; "$0" verify-insufficient > "$logdir/insufficient.verify.txt"; "$0" redeem-402 3 >> "$logdir/insufficient.verify.txt"
    step request .maestro/phase7-request-conflict.yaml pro sleep-stale requests-reset; "$0" verify-request > "$logdir/request.verify.txt"
    "$0" verify-upload | head -1 > "$logdir/upload.before.txt"
    step upload-a .maestro/phase7-upload-retry-a.yaml pro server-bad-bucket
    "$0" server-restore >> "$logdir/upload-a.setup.txt" 2>&1
    step upload-b .maestro/phase7-upload-retry-b.yaml; "$0" verify-upload > "$logdir/upload.verify.txt"
    step offline .maestro/phase7-offline-writes.yaml "unacquire 4" requests-reset; "$0" verify-offline > "$logdir/offline.verify.txt"
    pid3="$(sql "select public_id from marketplace_listing where id=3")"
    export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
    if (cd "$ROOT/mobile" && maestro --device "$SIM" test -e PUBLIC_ID_3="$pid3" .maestro/phase7-listing-links.yaml > "$logdir/links.log" 2>&1); then echo "PASS links"; else echo "FAIL links"; fails=$((fails+1)); fi
    "$0" pro > /dev/null
    echo "suite done: $fails failure(s); logs in $logdir"; exit $fails ;;
  verify-spark)
    echo "balance=$(balance)"; sql "select id,item_id,listing_id,price,created_at from reward_redemption where user_id=$USER_ID and item_id='market_unlock' order by id desc limit 3"
    sql "select id,listing_id,acquired_at from marketplace_acquisition where user_id=$USER_ID order by id desc limit 3" ;;
  verify-insufficient)
    echo "balance=$(balance)"; echo "acq listing 3: $(sql "select count(*) from marketplace_acquisition where user_id=$USER_ID and listing_id=3")" ;;
  verify-request)
    sql "select id,status,city_id,state_id,country_id,tag,day_count,participant_count from trip_request where user_id=$USER_ID order by id" ;;
  verify-upload)
    sql "select id,status,cover_image_url is not null as has_cover,(select count(*) from trip_plan_market_item i where i.listing_id=l.id) items,created_at from marketplace_listing l where created_by_id=$USER_ID order by id desc limit 3" ;;
  verify-offline)
    echo "acq listing 4: $(sql "select count(*) from marketplace_acquisition where user_id=$USER_ID and listing_id=4")"; echo "requests: $(sql "select count(*) from trip_request where user_id=$USER_ID")"; echo "newest listing: $(sql "select id,status,created_at from marketplace_listing where created_by_id=$USER_ID order by id desc limit 1")" ;;
  verify-links)
    sql "select id,public_id,name from marketplace_listing where id in (2,3,4) order by id" ;;
  *) sed -n 2,14p "$0"; exit 1 ;;
esac
