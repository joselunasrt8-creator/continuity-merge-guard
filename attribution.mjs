// actions/continuity-merge-guard/attribution.mjs
// ContinuityOS Agent Identity — Phase 1 (CI / Merge Guard plane).
// Attribution is metadata, not authority; it never alters merge execution
// semantics and never enters the canonical object-identity payload or hash.

import { canonicalize, sha256Hex } from './canonical.mjs'

const AGENT_BRANCH_PREFIXES = ['claude/', 'codex/', 'cursor/', 'devin/', 'copilot/']
const DECLARATION_MAP = {
  agent_authored: 'AGENT_AUTHORED',
  'agent-authored': 'AGENT_AUTHORED',
  agent: 'AGENT_AUTHORED',
  agent_assisted: 'AGENT_ASSISTED',
  'agent-assisted': 'AGENT_ASSISTED',
  assisted: 'AGENT_ASSISTED',
  human_authored: 'HUMAN_AUTHORED',
  'human-authored': 'HUMAN_AUTHORED',
  human: 'HUMAN_AUTHORED',
}

function str(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeDeclaration(raw) {
  const key = str(raw).toLowerCase().replace(/\s+/g, '_')
  return DECLARATION_MAP[key] || null
}

function splitList(raw) {
  return str(raw).split(/[,\n]/).map(t => t.trim()).filter(Boolean)
}

function isBotLogin(login) {
  return /\[bot\]$/i.test(str(login))
}

function fromLabels(labels) {
  const evidence = []
  for (const label of splitList(labels)) {
    const declares = normalizeDeclaration(label)
    if (declares) evidence.push({ signal_id: 'pr_label', tier: 'authoritative', value: label, declares })
  }
  return evidence
}

function fromBody(body) {
  const text = str(body)
  if (!text) return { evidence: [], agent_id: '', operator_id: '' }
  const attrMatch = text.match(/attribution\s*[:=]\s*([A-Za-z_-]+)/i)
  const agentMatch = text.match(/agent_id\s*[:=]\s*([^\s<>]+)/i)
  const operatorMatch = text.match(/operator_id\s*[:=]\s*([^\s<>]+)/i)
  const evidence = []
  if (attrMatch) {
    const declares = normalizeDeclaration(attrMatch[1])
    if (declares) evidence.push({ signal_id: 'pr_body_metadata_block', tier: 'authoritative', value: attrMatch[1], declares })
  }
  return {
    evidence,
    agent_id: agentMatch ? agentMatch[1] : '',
    operator_id: operatorMatch ? operatorMatch[1] : '',
  }
}

function fromTrailers(trailers) {
  const evidence = []
  let agent_id = ''
  for (const line of str(trailers).split('\n')) {
    const m = line.match(/^(Agent-Authored-By|Agent-Assisted-By)\s*:\s*(.+)$/i)
    if (!m) continue
    const declares = /assisted/i.test(m[1]) ? 'AGENT_ASSISTED' : 'AGENT_AUTHORED'
    const value = m[2].trim()
    evidence.push({ signal_id: 'commit_trailer', tier: 'authoritative', value, declares })
    if (declares === 'AGENT_AUTHORED' && !agent_id) agent_id = value
  }
  return { evidence, agent_id }
}

function fromBranch(headRef) {
  const ref = str(headRef)
  const prefix = AGENT_BRANCH_PREFIXES.find(p => ref.toLowerCase().startsWith(p))
  if (!prefix) return []
  return [{ signal_id: 'branch_naming_convention', tier: 'heuristic', value: ref, declares: null }]
}

export function classifyAttribution(input = {}) {
  const actor = str(input.actor)
  const prAuthor = str(input.pr_author) || actor
  const body = fromBody(input.pr_body)
  const trailers = fromTrailers(input.commit_trailers)
  const evidence = [
    ...fromLabels(input.pr_labels),
    ...body.evidence,
    ...trailers.evidence,
    ...fromBranch(input.head_ref),
  ]

  const botDetected = isBotLogin(actor) || isBotLogin(prAuthor)
  if (actor) {
    evidence.push({
      signal_id: 'github_actor_or_bot_account',
      tier: 'supporting',
      value: actor,
      declares: botDetected ? 'BOT' : null,
    })
  }

  const authoritativeClasses = [
    ...new Set(evidence.filter(e => e.tier === 'authoritative' && e.declares).map(e => e.declares)),
  ]

  let attribution_classification
  let actor_kind
  let confidence
  let attribution_status
  let attribution_source

  if (authoritativeClasses.length > 1) {
    attribution_classification = 'UNKNOWN'
    actor_kind = 'unknown'
    confidence = 'ambiguous'
    attribution_status = 'identity_ambiguous'
    attribution_source = 'declared'
  } else if (authoritativeClasses.length === 1) {
    attribution_classification = authoritativeClasses[0]
    actor_kind = attribution_classification === 'AGENT_AUTHORED' ? 'agent' : 'human'
    confidence = 'declared'
    attribution_status = 'identity_present'
    const driver = evidence.find(e => e.tier === 'authoritative' && e.declares === attribution_classification)
    attribution_source = driver && driver.signal_id === 'commit_trailer' ? 'commit_metadata' : 'declared'
  } else if (botDetected) {
    attribution_classification = 'UNKNOWN'
    actor_kind = 'bot'
    confidence = 'observed'
    attribution_status = 'identity_present'
    attribution_source = 'workflow_actor'
  } else {
    attribution_classification = 'UNKNOWN'
    actor_kind = 'unknown'
    const heuristicOnly = evidence.some(e => e.tier === 'heuristic')
    confidence = heuristicOnly ? 'inferred' : 'observed'
    attribution_status = 'identity_missing'
    attribution_source = 'pr_metadata'
  }

  const agentId = body.agent_id || trailers.agent_id
  let actor_id
  if (actor_kind === 'agent') actor_id = agentId || actor || 'unknown'
  else actor_id = actor || prAuthor || 'unknown'

  let operator_id = str(input.operator_id) || body.operator_id || null
  if (!operator_id && actor_kind === 'agent' && actor && !isBotLogin(actor)) {
    operator_id = actor
  }

  const attribution_evidence_hash = sha256Hex(canonicalize(evidence))
  return {
    actor_attribution: {
      actor_kind,
      actor_id,
      operator_id,
      attribution_source,
      confidence,
      evidence,
    },
    attribution_classification,
    attribution_status,
    attribution_evidence_hash,
  }
}
