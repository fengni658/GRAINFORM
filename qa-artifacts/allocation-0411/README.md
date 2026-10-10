# Independent allocation candidate, archived 2026-10-10

This directory stores the already-produced allocation-only 0.4.11 candidate for independent Codex review. It is not a deployment or performance acceptance. Main and the Site are outside this change.

## Evidence boundary

- The existing Node sync-equivalence result is 6/6. The existing inherited queue-continuity and phone-board geometry results are 23/23 and 10/10. These are historical evidence, not tests rerun for this archive.
- Actual-browser performance acceptance has NOT been completed for this candidate. No browser or total-frame speedup is claimed. Geometry model/source checks are not native-phone/DPR evidence.
- REPORT.md and MANIFEST.json are unchanged source artifacts. Their local-only status, local directory references, original reproduction paths and omitted evidence references describe the original preparation, before this GitHub archive. Use this README for retrieval and reproduction. CPU profiles, historical source trees, initial probes and duplicate browser images are intentionally omitted here; omission does not invalidate or turn an unfavorable result into a pass.
- Original short logs are preserved under evidence/. No Node tests, browser tests or performance probes were run while archiving; only static artifact, manifest, byte-difference, ZIP and remote Git blob integrity checks were performed.

## Identity and scope

BuildId: b-ab4e880d36685de4fb4983db6ad34295658bdb44c46defce0fae2c7427506065

The runtime contains the 11 files named in MANIFEST.json. The build ID hashes sorted `filename + space + SHA-256 + newline`, including index.html. All 11 candidate bytes match the manifest and runtime ZIP. Only ca-adapter.mjs differs from the frozen 0.4.11 baseline; allocation-sync.patch is the exact difference. Changes are confined to sync() and its explanatory comment; all surrounding adapter code and the other ten files are byte-identical. Physics, material, rendering, transport, clear, ACK and UI logic are outside this change.

Runtime ZIP SHA-256: cf93b45cc11b3542c3c09ea021bbc5dd7e7763101e2ab57ac58a932f56ed4f75

Its .zip.base64.txt is a UTF-8 transport copy of the exact ZIP. Decode it with Python when a connector cannot fetch binary files:

```sh
python -c "import base64,pathlib; p=pathlib.Path('GRAINFORM-0.4.11-allocation-runtime.zip'); p.write_bytes(base64.b64decode(pathlib.Path(str(p)+'.base64.txt').read_text()))"
```

Verify the SHA-256 above before extracting. A candidate runtime is archived, not installed into the repository's runnable source.

## Baseline dependency and independent six-test reproduction

The unchanged six-test script is validation/sync-equivalence.test.mjs. It expects candidate/ and evidence/baseline0411/ beside validation/. Create these in a disposable local directory; do not replace repository source.

The baseline dependency is already stored at qa-artifacts/GRAINFORM-0.4.11-phone-board-runtime.zip in fixed commit e69f07036e40244d0556c75b65c0e86e1acfc42c. Its Git blob is c447b835a89f246198ecc53595f5b884ae2eb759 and ZIP SHA-256 is 9353da895f3647b8d4bd250126415e74ecabcc3f39feae4cc640ea27c6808138. Baseline buildId is b-c09a9ea6b2fe85a5f439a6e9424da32ffa62a1a53c10f4f4008ae2e274f45b82. This dependency is not duplicated in this directory.

From a checkout of the final archive commit, use the Python preparation below from this directory. It verifies both ZIP identities and every runtime/baseline SHA-256, and only materializes the two input directories. It does not execute tests.

```python
from pathlib import Path
import hashlib, json, zipfile
m = json.loads(Path('MANIFEST.json').read_text())
inputs = [
 ('GRAINFORM-0.4.11-allocation-runtime.zip', 'cf93b45cc11b3542c3c09ea021bbc5dd7e7763101e2ab57ac58a932f56ed4f75', m['buildId'], 'candidate', m['files']),
 ('../GRAINFORM-0.4.11-phone-board-runtime.zip', '9353da895f3647b8d4bd250126415e74ecabcc3f39feae4cc640ea27c6808138', 'b-c09a9ea6b2fe85a5f439a6e9424da32ffa62a1a53c10f4f4008ae2e274f45b82', 'evidence/baseline0411', m['baseline'])
]
for name, digest, build, target, files in inputs:
    p = Path(name)
    assert hashlib.sha256(p.read_bytes()).hexdigest() == digest
    out = Path(target)
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(p) as z:
        for f in files:
            b = z.read('experimental/0.4.11/builds/' + build + '/' + f['file'])
            assert hashlib.sha256(b).hexdigest() == f['sha256']
            (out / f['file']).write_bytes(b)
```

Independent reviewers can then run `node --test validation/sync-equivalence.test.mjs` with a Node.js version supporting node:test. No npm dependencies are needed. This command has deliberately not been run as part of archival. Queue/geometry scripts and their wider fixture dependencies remain in the existing phone-board validation package; their retained logs are historical context, not a substitute for fresh independent review or the pending matched-condition real-browser performance gate.
