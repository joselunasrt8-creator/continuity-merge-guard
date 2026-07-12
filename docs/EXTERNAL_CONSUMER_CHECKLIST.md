# External Consumer Checklist

This bounded evaluation should take about 15–30 minutes and does not require production deployment.

1. Install StateGate in a disposable repository, test branch, or explicit evaluation workflow.
2. Pin `uses: joselunasrt8-creator/stategate@v1` or an exact release such as `@v1.1.1`.
3. Run a VALID fixture and record workflow path, run id, conclusion, and proof artifact hash.
4. Run a deterministic NULL fixture, such as malformed local diff input, and record the bounded NULL reason.
5. Inspect `MERGE_GUARD_PROOF.json` and verify the proof hash is stable for the evaluated object.
6. Enable StateGate as a required check if the operator approves doing so.
7. Record repository owner, operator, trust-boundary class, workflow path, required check name, and run identifiers.
8. Decide whether to retain StateGate after the bounded evaluation.
9. Optionally schedule a controlled removal/degradation experiment using `docs/templates/REMOVAL_DEGRADATION_REPORT.md`.

Do not fabricate repository URLs, workflow runs, maintainers, or proof hashes. Installation alone is not independent dependency.
