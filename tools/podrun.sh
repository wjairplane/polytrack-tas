#!/bin/bash
# Parallel search for many-core machines (e.g. a rented CPU pod). Every round runs one leadsearch pass per core from the
# current best run, each with its own seed, and keeps the run that finishes first; then every core runs a finish polish
# (finclimb) on the best run and the fastest result wins. Only runs that finish faster than the start are kept.
# usage: TRACK=<slug> tools/podrun.sh <base.json> <out dir> [rounds=3] [processes=nproc] [seconds per window=30]
# extra leadsearch settings pass through the environment (START, END, WIN, STEP, HOR, GCAP, ...); FINMIN = finish polish minutes
set -u
cd "$(dirname "$0")/.."
BASE=$(realpath "$1"); OUT=$(realpath -m "$2"); ROUNDS=${3:-3}; NP=${4:-$(nproc)}; WT=${5:-30}
mkdir -p "$OUT"; cp "$BASE" "$OUT/best.json"
fin() { node tools/finish.js "$@" 2>/dev/null | grep -v wasm | grep -v falling; }
BEST=$(fin "$OUT/best.json" | awk '{print $1}'); echo "$(date -u +%H:%M) start: $BEST ms with $NP processes"
for r in $(seq 1 "$ROUNDS"); do
  for i in $(seq 1 "$NP"); do
    REF="$OUT/best.json" BASE="$OUT/best.json" OUT="$OUT/r${r}_$i.json" SEED=$((r * 1000 + i)) WT=$WT \
      node --max-old-space-size=2048 tools/leadsearch.js > "$OUT/r${r}_$i.log" 2>&1 &
  done; wait
  read -r F W < <(fin "$OUT"/r${r}_*.json | grep -v DNF | sort -n | head -1)
  if [ -n "${F:-}" ] && [ "$F" -lt "$BEST" ]; then BEST=$F; cp "$W" "$OUT/best.json"; fi
  echo "$(date -u +%H:%M) round $r: best $BEST ms ($(fin "$OUT"/r${r}_*.json | grep -vc DNF)/$NP finished)"
done
FROM=${FINFROM:-$((BEST - 2500))}
for i in $(seq 1 "$NP"); do node --max-old-space-size=2048 tools/finclimb.js "$OUT/best.json" "$OUT/fin_$i.json" "${FINMIN:-20}" "$FROM" "$i" > "$OUT/fin_$i.log" 2>&1 & done; wait
read -r F W < <(fin "$OUT"/fin_*.json | grep -v DNF | sort -n | head -1)
if [ -n "${F:-}" ] && [ "$F" -lt "$BEST" ]; then BEST=$F; cp "$W" "$OUT/best.json"; fi
echo "$(date -u +%H:%M) done: best $BEST ms -> $OUT/best.json"
