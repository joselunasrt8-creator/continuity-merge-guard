# External Adoption and Dependency Evidence Protocol

StateGate installation is not successful use; successful use is not repeat use; repeat use is not retention; retention is not load-bearing adoption; and load-bearing adoption is not independent dependency. This protocol records only falsifiable evidence and does not claim independent dependency until the required counterfactual evidence exists.

## Trust-boundary control classes

- `SAME_OWNER`: the evaluator, StateGate maintainer, or same account controls the consumer repository or its policy.
- `SAME_ORGANIZATION_SHARED_CONTROL`: a separate repository exists, but administrative control, branch protection, workflow retention, or publication approval is shared with the evaluator's organization.
- `COLLABORATOR_CONTROLLED`: an outside collaborator operates some workflow content but lacks full independent authority over repository administration, branch protection, workflow retention, whether StateGate remains enabled, or whether evidence may be published.
- `INDEPENDENT_EXTERNAL_MAINTAINER`: an independently controlled maintainer controls repository administration, branch protection, workflow retention, whether StateGate remains enabled, and whether the evidence may be published.
- `SANDBOX_OR_TEST`: disposable, test, demonstration, fork, fixture, or evaluator-created repository.
- `UNKNOWN`: the control boundary is not known. Unknown never qualifies as independent.

A repository is not independent merely because it is a separate repository.

## Adoption stages

| Stage | Entry condition | Required evidence | Disqualifying conditions | Transition criteria | Same-owner qualifies? | Independent trust boundary required? | Type |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `STAGE_0_NOT_INSTALLED` | No observed installation. | Absence or unobserved installation record. | Any observed StateGate workflow install. | Observe voluntary external installation. | Yes, as non-independent baseline. | No. | Observational. |
| `STAGE_1_EXTERNAL_INSTALLATION` | StateGate workflow reference is present. | Workflow path, ref, commit or run identifier, voluntary install flag. | Fabricated URL, inaccessible claim, non-voluntary setup for dependency claims. | First successful VALID run. | Yes. | No. | Observational. |
| `STAGE_2_FIRST_VALID_RUN` | At least one VALID StateGate run. | Run id/conclusion and proof hash or artifact reference. | Missing proof, ambiguous run, disputed run. | First bounded NULL block. | Yes. | No. | Observational. |
| `STAGE_3_FIRST_NULL_BLOCK` | At least one deterministic bounded NULL. | NULL run id, failure conclusion, bounded reason, proof hash. | Unbounded outage, unrelated CI failure, non-StateGate failure. | Required check enabled. | Yes. | No. | Observational. |
| `STAGE_4_REQUIRED_CHECK_ENABLED` | Branch or ruleset requires StateGate check. | Required check name and operator-controlled protection evidence. | Advisory-only status, evaluator-enforced setting without operator control. | Repeat use across PRs or time-separated runs. | Yes. | No. | Observational. |
| `STAGE_5_REPEAT_USAGE` | Multiple PRs or time-separated runs. | Run count, PR count or timestamps. | Single rehearsed run, fixture-only execution. | Operator elects to retain. | Yes. | No. | Observational. |
| `STAGE_6_OPERATOR_RETAIN` | Operator records retain decision. | Retention decision record by operator. | Silent inertia, evaluator pressure, undecided operator. | Approved removal/bypass/outage experiment. | Yes. | No. | Inferential about value, observational about decision. |
| `STAGE_7_REMOVAL_DEGRADATION` | Controlled counterfactual has baseline, absence condition, restoration. | Experiment condition, approval, baseline, observed lost properties, restoration confirmation. | Production weakening without approval, no restoration, no material loss. | All independent dependency criteria satisfied. | Yes for load-bearing within its boundary, never for independent dependency. | Required only to advance to stage 8. | Inferential. |
| `STAGE_8_INDEPENDENT_DEPENDENCY_CONFIRMED` | Independent dependency rule passes. | Complete schema-valid evidence with no dispute. | Same-owner, sandbox, unknown, missing degradation/restoration, fabricated evidence. | None. | No. | Yes. | Inferential and falsifiable. |

## Minimum independent dependency rule

`STAGE_8_INDEPENDENT_DEPENDENCY_CONFIRMED` requires all of the following: `trust_boundary_class == INDEPENDENT_EXTERNAL_MAINTAINER`; voluntary installation; at least one VALID run; at least one bounded NULL block; required check enabled; repeated use across multiple pull requests or time-separated runs; operator decision to retain; controlled removal, bypass, or outage experiment; observable degradation when StateGate is absent; restoration confirmed; and no unresolved evidence dispute. Same-owner and sandbox evidence must never satisfy this classification.

## Removal and degradation experiment

Safe counterfactual states are distinct:

- `REMOVED`: StateGate workflow/check is deleted from the evaluated branch.
- `DISABLED`: workflow remains but is disabled or made non-triggering.
- `BYPASSED`: merge eligibility path excludes StateGate while the workflow may still run.
- `UNAVAILABLE`: StateGate cannot execute because its dependency/action/ref is unavailable.
- `RETURNED_NULL`: StateGate runs and returns NULL; this tests fail-closed behavior, not removal.

Use a disposable repository, test branch, or explicit operator approval. Record baseline behavior with StateGate enabled, temporarily remove or bypass one condition, record which validation, proof, and merge-eligibility properties disappear, restore StateGate, and record whether the operator chooses to retain it. Do not weaken a production repository without explicit authorization.
