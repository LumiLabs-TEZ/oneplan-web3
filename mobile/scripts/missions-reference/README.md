# Missions visual reference

Run from the repository root with a booted iOS simulator:

```sh
python3 mobile/scripts/missions-reference/build.py
```

The script compiles copies of production Swift view bodies, local services and the same JSON fixture used by RN. No API requests or native production-source edits are made. Original artwork is also exported to the reference app's Documents directory at 3×; the checked-in RN PNGs are scaled copies of those exports.

Start the mobile Expo development server, open its native development client, then open `dev.lumilabs.oneplan://missions-reference` (iOS) or `oneplan://missions-reference` (Android). The route is development-only. Optional parameters: `scenario=retry|empty|insufficient|partial`, `language=en|vi`. Query and transport state are isolated from account data.

`rn.yaml`, `android.yaml`, `swift.yaml` and `swift-success.yaml` exercise the production bodies. `states.yaml` exercises failure/retry, empty, unaffordable, partial success and Vietnamese fixtures. All state assertions must pass before accepting that matrix; do not treat partial runs as passes.

`record.py rn` and `record.py swift` record the iOS flows; `record-android.py` records the Android happy path. `states-android.yaml` runs the parameterized states on a warm development client. Adjust the simulator UDID/Java location for another machine. `compare.py` generates overlays and differences only for equal-sized images. The pinned Swift revision and the default `--evidence` directory live once in `_common.py`; re-pin there. Captures are evidence for human review, not automatic visual approval. See the Phase 8 report for remaining gaps.

The builder now reads production sources, fonts, assets, and localization directly from
`4723846f05f786e78883d41bdf7ac0976a80e81e` with `git show`, regardless of working-tree changes.
It includes `reference-metadata.json` in the reference bundle. The RN fixture also owns
subscription/quota refreshes; nested sheet content explicitly carries its QueryClient and
transport across the bottom-sheet portal. Success flows assert the reference's four-credit
quota, preventing an account-backed quota from silently entering screenshots.

The iOS flows use a local Metro server on port 8081. They stop the app before opening the
development bundle, avoiding two competing launches/reloads. Android flows expect a warm
client (`adb reverse tcp:8081 tcp:8081`). For overlay-free Android captures, disable the
Expo dev-menu floating button (`showFab`) in the emulator's development-client preferences;
this is a capture-device setting, not an app production change. `swift-vi.yaml` launches the
pinned production views with Vietnamese localization.

Keep new evidence in its own directory:

```sh
python3 mobile/scripts/missions-reference/record.py rn --evidence /tmp/new-evidence
python3 mobile/scripts/missions-reference/record.py swift --evidence /tmp/new-evidence
python3 mobile/scripts/missions-reference/record-android.py --evidence /tmp/new-evidence
python3 mobile/scripts/missions-reference/manifest.py /tmp/new-evidence --font-scale 1 --language en
python3 mobile/scripts/missions-reference/compare.py --evidence /tmp/new-evidence
```

`manifest.py` records surface, implementation/platform, scenario, language, pixel viewport,
text scale, pinned reference revision, fixture hash and original PNG hash. Use separate
folders for different languages/scenarios. These are declared session settings, not automatic
proof of parity. With a manifest, comparison rejects stale hashes or differing capture states
in addition to unequal dimensions. Every generated entry remains `visualAcceptance: pending`.
