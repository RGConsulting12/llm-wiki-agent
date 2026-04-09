# Single-Repo Skills Policy

Status: Active  
Owner: Repository maintainers  
Effective date: 2026-04-09

## Purpose

Standardize agent behavior on one canonical engineering-skills source to reduce instruction drift, context bloat, and conflicting workflows.

## Policy

1. **Canonical skills repository:** `https://github.com/RGConsulting12/agent-skills`
2. **Default behavior:** agents must use `agent-skills` workflows as the first and only default skills layer.
3. **Non-default repositories:** `everything-claude-code` (and any equivalent mega-pack) must not be used as a baseline skills source.
4. **Gap handling:** if a needed workflow is missing, maintainers should:
   - add a local task-specific instruction in the current repo, and
   - upstream a reusable version to `agent-skills`.
5. **Exception process:** temporary exceptions must be explicit, task-scoped, and documented in PR text with:
   - why `agent-skills` was insufficient,
   - which external skill was used,
   - planned removal date or upstreaming plan.

## Allowed integration pattern

- Keep this repo's domain-specific wiki instructions (`ingest/query/lint/graph`) in local instruction files.
- Use `agent-skills` for software-engineering execution quality (planning, testing, review, security, shipping).
- Do not globally load additional skill packs by default.

## Governance controls

- Human-readable policy: this document.
- Machine-enforced guard: `tools/check_skills_policy.py`
- CI gate: `.github/workflows/skills-policy.yml`

## Success criteria

- All agent instruction files include the same single-repo policy block.
- CI fails on policy drift or conflicting default repo references.
- New workflow needs are contributed to `agent-skills` instead of introducing a second default skills repo.
