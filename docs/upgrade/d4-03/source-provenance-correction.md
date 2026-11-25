# D4-03 resumed provenance correction

FACT: UI run 45543877533 at c61d1edaca6d081faa138feb2e268bcc52b59aa3 failed before domain/browser/Android tests. The guard identified nine content mismatches in the 99-entry source manifest. These were not line-ending differences: all nine old entries matched the historical local snapshot whose Git identity was not established.

FACT: static Codespaces reconciliation at c534a03eb0bb186980ddb209811f4ea903e10c4c examined all 99 frozen Git blobs at d4c5af4cbbb9192c19276dd371bd142c2b835534, found zero line-ending corrections and nine content blockers, and refused to write a replacement manifest. Its original manifest, 99 canonical blobs and receipt were preserved in d403-canonical-audit-01.zip and published at 787691bb90fed636101d31dc4def03533c946db4. The downloaded archive SHA-256 is f3b23c116b59729bb751e2bbadf07b322abf927bb89669058bb568bad12cf7fd.

FACT: all three inner archive hashes, all 99 blob SHA-256 hashes/lengths and Git blob SHA-1 identities were checked by static file/hash operations after download. The original manifest is preserved byte-for-byte. source-provenance-correction.json records the nine before/after values; the baseline, 99 paths and other 90 values are unchanged. provenance.mjs remains unchanged and checks every baseline blob against the candidate manifest. This is a source correction supported by the focused review in canonical-source-review.md, not a waiver of that guard.

FACT: only src/model.mjs among the nine affected files enters the seven-module pure UI bundle. The frozen production source diff guard and build-receipt input hashes must both bind its actual bytes. The other affected storage/synchronization files are neither imported nor activated by this preview. Existing protocol protections belong to the frozen master, not this UI change.

UNVERIFIED: this correction has not yet passed the next Actions provenance, domain, DOM or native run. Historical UI/storage line references and the old ID-length assertion are superseded only where the focused canonical review gives explicit evidence. This does not prove native production integration, real migration or production synchronization. D4-03 remains NOT CLOSED; Android issue #1 remains Open.

FACT: failed run evidence02 SHA-256 is 06cc3443d1eff76b4b2ca5b49b7bdb32fae3a9e12660449f6669b2eb2632f85c. Both original failed runs and all historical limitations remain retained.
