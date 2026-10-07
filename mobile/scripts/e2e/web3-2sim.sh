#!/usr/bin/env bash
# Two-simulator web3 e2e driver. Every step records BOTH simulators (so realtime reactions on the
# other device are captured) while Maestro drives one of them.
#
#   scripts/e2e/web3-2sim.sh step <name> <A|B> <flow.yaml> [maestro -e args...]
#   scripts/e2e/web3-2sim.sh shot <A|B> <name>      # screenshot only
#   scripts/e2e/web3-2sim.sh stitch                  # concat passing clips per sim + side-by-side
#
# A = iPhone Air (user 2), B = iPhone 17 (spike, user 80). Output: $OUT (default /tmp/web3-e2e).
set -euo pipefail
A_UDID="${A_UDID:-6320ABBC-3C39-4836-B91A-EEAF2900871E}"
B_UDID="${B_UDID:-370DE19F-D4A3-4E40-A22A-14CD55A3B3BA}"
OUT="${OUT:-/tmp/web3-e2e}"
FLOWS="$(cd "$(dirname "$0")/../../.maestro/web3" && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
mkdir -p "$OUT/clips" "$OUT/failed" "$OUT/logs" "$OUT/shots"

udid() { [[ "$1" == A ]] && echo "$A_UDID" || echo "$B_UDID"; }

record_start() { # <udid> <file>
  xcrun simctl io "$1" recordVideo --codec=h264 --force "$2" >/dev/null 2>&1 &
  echo $!
}

case "${1:-}" in
  step)
    name="$2"; sim="$3"; flow="$4"; shift 4
    seq=$(printf '%02d' "$(ls "$OUT/clips" | grep -c -- '-A.mp4' || true)")
    tag="${seq}-${name}"
    pa=$(record_start "$A_UDID" "$OUT/clips/$tag-A.mp4")
    pb=$(record_start "$B_UDID" "$OUT/clips/$tag-B.mp4")
    sleep 2
    set +e
    maestro --device "$(udid "$sim")" test "$FLOWS/$flow" "$@" \
      --debug-output "$OUT/logs/$tag" >"$OUT/logs/$tag.log" 2>&1
    rc=$?
    set -e
    sleep 2
    kill -INT "$pa" "$pb" 2>/dev/null || true
    wait "$pa" "$pb" 2>/dev/null || true
    if [[ $rc -ne 0 ]]; then
      stamp=$(date +%H%M%S)
      mv "$OUT/clips/$tag-A.mp4" "$OUT/failed/$tag-$stamp-A.mp4" 2>/dev/null || true
      mv "$OUT/clips/$tag-B.mp4" "$OUT/failed/$tag-$stamp-B.mp4" 2>/dev/null || true
      echo "FAIL $tag (see $OUT/logs/$tag.log)"; tail -15 "$OUT/logs/$tag.log"; exit $rc
    fi
    echo "PASS $tag"
    ;;
  shot)
    xcrun simctl io "$(udid "$2")" screenshot "$OUT/shots/$3.png" >/dev/null && echo "$OUT/shots/$3.png"
    ;;
  stitch)
    # Per step: pad the shorter clip with its last frame and put both sims side by side, so the
    # two devices stay in sync across the whole run; then concat the steps.
    mkdir -p "$OUT/pairs"
    : >"$OUT/list-pairs.txt"
    for a in $(ls "$OUT/clips"/*-A.mp4 | sort); do
      tag=$(basename "$a" -A.mp4)
      b="$OUT/clips/$tag-B.mp4"
      da=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$a")
      db=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$b")
      d=$(python3 -c "print(max($da,$db))")
      ffmpeg -y -loglevel error -i "$a" -i "$b" -filter_complex \
        "[0:v]scale=-2:1600,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=120[l];[1:v]scale=-2:1600,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=120[r];[l][r]hstack=inputs=2,pad=ceil(iw/2)*2:ceil(ih/2)*2[v]" \
        -map "[v]" -t "$d" -c:v libx264 -pix_fmt yuv420p -preset veryfast "$OUT/pairs/$tag.mp4"
      echo "file '$OUT/pairs/$tag.mp4'" >>"$OUT/list-pairs.txt"
    done
    ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUT/list-pairs.txt" -c copy "$OUT/side-by-side.mp4"
    for s in A B; do
      ls "$OUT/clips"/*-"$s".mp4 | sort | sed "s/^/file '/; s/$/'/" >"$OUT/list-$s.txt"
      ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUT/list-$s.txt" \
        -vf "scale=-2:1600,fps=30" -c:v libx264 -pix_fmt yuv420p "$OUT/sim$s.mp4"
    done
    ls -la "$OUT"/*.mp4
    ;;
  *) sed -n 2,9p "$0"; exit 1 ;;
esac
