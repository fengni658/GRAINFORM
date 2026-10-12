# 0.5.8 rejected research checkpoint

Research only: this prototype is not integrated into the continuing product, which retains the 0.5.6 runtime. Fewer visited slots did not demonstrate a time benefit; the only clean native comparison reported Game.step +33.45%. Both original interfered and clean data are retained and separately labelled. No browser FPS claim.

Run correctness only: node --test tests/frame-visit-bitmap.test.mjs tests/frame-visit-bitmap-sensitivity.test.mjs . The baseline imports use adjacent stages/0.5.6/candidate. Paired cost scripts and frozen original data are archived for reproduction; no performance retry is implied. To deliberately run the collector, explicitly set CANDIDATE to the chosen absolute source directory and EVIDENCE to a new output directory; preserve existing evidence.

Runtime source bytes match R1-BUILD-MANIFEST.json. Test imports alone are adapted to the repository layout. Main and published Sites are unchanged.
