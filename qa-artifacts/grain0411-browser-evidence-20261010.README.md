# Browser evidence transfer (2026-10-10)

Evidence for independent review of the frozen GRAINFORM 0.4.11 phone-board candidate at commit e69f07036e40244d0556c75b65c0e86e1acfc42c.

- ZIP: `grain0411-browser-evidence-20261010.zip`
- UTF-8 transport copy: `grain0411-browser-evidence-20261010.zip.base64.txt`
- ZIP bytes: 108699
- ZIP SHA-256: `5c1a5fbe4f88903fbf6517d9de8ff68c28d2870939750f412e8cfa4d31f0a746`

The base64 file decodes to the exact ZIP, not an alternate evidence set. Fetch it as UTF-8 when binary downloads are unsupported, then decode and verify before extracting:

```sh
base64 --decode grain0411-browser-evidence-20261010.zip.base64.txt > grain0411-browser-evidence-20261010.zip
printf '%s  %s\n' '5c1a5fbe4f88903fbf6517d9de8ff68c28d2870939750f412e8cfa4d31f0a746' 'grain0411-browser-evidence-20261010.zip' | sha256sum --check
unzip grain0411-browser-evidence-20261010.zip -d grain0411-browser-evidence-20261010
```

On macOS, use `base64 -D` and `shasum -a 256` instead. Read ADDENDUM.md, SESSION.md and MANIFEST.json before interpreting the images and raw tool results. This artifact transfer does not constitute a QA pass or deployment, and does not alter existing QA findings.
