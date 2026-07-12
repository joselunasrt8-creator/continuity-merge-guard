#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(readFileSync(join(dir, '..', 'schemas', 'external-adoption-evidence.schema.json'), 'utf8'))

const allowed = {
  adoption_stage: ['STAGE_0_NOT_INSTALLED','STAGE_1_EXTERNAL_INSTALLATION','STAGE_2_FIRST_VALID_RUN','STAGE_3_FIRST_NULL_BLOCK','STAGE_4_REQUIRED_CHECK_ENABLED','STAGE_5_REPEAT_USAGE','STAGE_6_OPERATOR_RETAIN','STAGE_7_REMOVAL_DEGRADATION','STAGE_8_INDEPENDENT_DEPENDENCY_CONFIRMED']
}
const stageRank = Object.fromEntries(allowed.adoption_stage.map((s, i) => [s, i]))

function err(path, msg) { return `${path}: ${msg}` }
function hasObserved(o) { return o?.status === 'OBSERVED' }
function pointerDecode(part) { return part.replace(/~1/g, '/').replace(/~0/g, '~') }
function resolveRef(ref) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported schema ref ${ref}`)
  return ref.slice(2).split('/').map(pointerDecode).reduce((node, part) => node?.[part], schema)
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function typeName(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}
function validDateTime(value) {
  if (typeof value !== 'string') return false
  const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
  return isoDateTime.test(value) && !Number.isNaN(Date.parse(value))
}
function validateSchemaNode(node, value, path, errors) {
  if (node.$ref) return validateSchemaNode(resolveRef(node.$ref), value, path, errors)
  if (node.const !== undefined && value !== node.const) errors.push(err(path, `must equal ${JSON.stringify(node.const)}`))
  if (node.enum && !node.enum.includes(value)) errors.push(err(path, `unsupported value ${JSON.stringify(value)}`))
  if (node.type) {
    const actual = typeName(value)
    if (node.type === 'integer') {
      if (!Number.isInteger(value)) errors.push(err(path, `must be integer, got ${actual}`))
    } else if (actual !== node.type) {
      errors.push(err(path, `must be ${node.type}, got ${actual}`))
    }
  }
  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(err(path, `length must be >= ${node.minLength}`))
    if (node.pattern && !(new RegExp(node.pattern).test(value))) errors.push(err(path, `must match pattern ${node.pattern}`))
    if (node.format === 'date-time' && !validDateTime(value)) errors.push(err(path, 'must be date-time'))
  }
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) errors.push(err(path, `must be >= ${node.minimum}`))
  if (Array.isArray(value) && node.items) value.forEach((item, index) => validateSchemaNode(node.items, item, `${path}[${index}]`, errors))
  if (isObject(value)) {
    const properties = node.properties || {}
    for (const required of node.required || []) if (!(required in value)) errors.push(err(`${path}.${required}`.replace(/^\$\./, ''), 'required field missing'))
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in properties)) errors.push(err(`${path}.${key}`.replace(/^\$\./, ''), 'additional property not allowed'))
    }
    for (const [key, child] of Object.entries(properties)) if (key in value) validateSchemaNode(child, value[key], `${path}.${key}`.replace(/^\$\./, ''), errors)
  }
}
function validateSchema(evidence) {
  const errors = []
  validateSchemaNode(schema, evidence, '$', errors)
  return errors
}
function validateSemantics(e) {
  const errors = []
  const r = stageRank[e.adoption_stage] ?? -1
  if (r >= 1 && !hasObserved(e.installation_evidence)) errors.push(err('installation_evidence.status', 'must be OBSERVED for stage >= STAGE_1'))
  if (r >= 2 && !hasObserved(e.valid_run_evidence)) errors.push(err('valid_run_evidence.status', 'must be OBSERVED for stage >= STAGE_2'))
  if (r >= 3 && !hasObserved(e.null_run_evidence)) errors.push(err('null_run_evidence.status', 'must be OBSERVED for stage >= STAGE_3'))
  if (r >= 4 && !e.required_check_name) errors.push(err('required_check_name', 'must be populated for stage >= STAGE_4'))
  if (r >= 5 && !(hasObserved(e.repeat_usage_evidence) && e.repeat_usage_evidence.run_count >= 2 && (e.repeat_usage_evidence.pull_request_count >= 2 || e.repeat_usage_evidence.time_separated))) errors.push(err('repeat_usage_evidence', 'must show multiple PRs or time-separated repeated runs for stage >= STAGE_5'))
  if (r >= 6 && !(hasObserved(e.retention_evidence) && e.retention_evidence.operator_decision === 'RETAIN')) errors.push(err('retention_evidence', 'operator RETAIN decision required for stage >= STAGE_6'))
  if (r >= 7) {
    if (!(hasObserved(e.removal_experiment) && e.removal_experiment.operator_approved && e.removal_experiment.baseline_recorded && e.removal_experiment.restored && e.removal_experiment.restoration_confirmed)) errors.push(err('removal_experiment', 'approved baseline, restore, and restoration confirmation required for stage >= STAGE_7'))
    if (!(hasObserved(e.degradation_observation) && e.degradation_observation.materially_weaker)) errors.push(err('degradation_observation', 'observable material degradation required for stage >= STAGE_7'))
  }
  if (e.adoption_stage === 'STAGE_8_INDEPENDENT_DEPENDENCY_CONFIRMED') {
    if (e.trust_boundary_class !== 'INDEPENDENT_EXTERNAL_MAINTAINER') errors.push(err('trust_boundary_class', 'must be INDEPENDENT_EXTERNAL_MAINTAINER for independent dependency'))
    if (!e.installation_evidence?.voluntary_install) errors.push(err('installation_evidence.voluntary_install', 'must be true for independent dependency'))
    if (!e.null_run_evidence?.bounded) errors.push(err('null_run_evidence.bounded', 'bounded NULL block required for independent dependency'))
    if (e.evidence_status === 'DISPUTED' || [e.installation_evidence,e.valid_run_evidence,e.null_run_evidence,e.repeat_usage_evidence,e.retention_evidence,e.removal_experiment,e.degradation_observation].some(x => x?.status === 'DISPUTED')) errors.push(err('evidence_status', 'no unresolved evidence dispute allowed for independent dependency'))
    if (!(e.degradation_observation?.validation_property_lost && e.degradation_observation?.proof_property_lost && e.degradation_observation?.merge_eligibility_property_lost)) errors.push(err('degradation_observation', 'validation, proof, and merge-eligibility loss must all be observed'))
  }
  return errors
}
function validate(evidence) {
  return [...validateSchema(evidence), ...validateSemantics(evidence)].sort()
}

if (process.argv.length < 3) { console.error('usage: validate-external-adoption-evidence.mjs <evidence.json> [...]'); process.exit(2) }
let failed = false
for (const file of process.argv.slice(2)) {
  let evidence
  try { evidence = JSON.parse(readFileSync(file, 'utf8')) } catch (e) { console.error(`${basename(file)}: invalid JSON: ${e.message}`); failed = true; continue }
  const errors = validate(evidence)
  if (errors.length) { failed = true; console.error(`${basename(file)}: INVALID`); for (const e of errors) console.error(`  - ${e}`) }
  else console.log(`${basename(file)}: VALID`)
}
process.exit(failed ? 1 : 0)
