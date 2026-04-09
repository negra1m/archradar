# archradar

**Motor de Inteligência Arquitetural para times de frontend modernos.**

> Escaneie seu projeto. Entenda sua arquitetura. Corrija o que importa.
> Por [Few Company](https://fewcompany.com)

---

## Preview

<p align="center">
  <img src="./assets/demo.gif" alt="ArchRadar demo" width="100%" />
</p>

---

## Instalação

```bash
npm install -g @fewcompany/archradar
```

Ou rode sem instalar:

```bash
npx @fewcompany/archradar
```

---

## Uso

Rode dentro de qualquer projeto frontend:

```bash
archradar
```

### Comandos

```bash
archradar scan           # Scan arquitetural completo (padrão)
archradar scan --json    # Saída em JSON
archradar --version      # Versão
archradar --help         # Ajuda
```

---

## O que analisa

- **Detecção de framework** — React, Next.js, Vite, Vue, Angular, Svelte
- **Saúde das dependências** — desatualizadas, não usadas, alto risco
- **Estrutura de arquivos** — profundidade, distribuição de tamanho, arquivos críticos
- **Complexidade** — complexidade ciclomática via análise de AST
- **Acoplamento** — dependências entre módulos e densidade de acoplamento
- **Dependências circulares** — detectadas e mapeadas
- **Modularidade** — coesão e separação de responsabilidades

---

## Output

```
╭──────────────────────────────────────────╮
│  ARCHRADAR — Architectural Intelligence  │
│  by Few Company                          │
╰──────────────────────────────────────────╯

  Project:   meu-app
  Framework: Next.js 14
  Files:     312
  Avg lines: 98
  Total deps: 48

  ─────────────────────────────────────────
  ARCHITECTURAL HEALTH SCORE
  ─────────────────────────────────────────

  ██████████░░░░░░░░░░  52/100  [C]

  Risk Level: HIGH
  Intervention needed. Accumulated technical debt.

  ─────────────────────────────────────────
  FINDINGS
  ─────────────────────────────────────────

  ⚠  12 critical file(s) (>300 lines)
  ✓  No circular dependencies
  ⚠  High complexity: SignupForm (score 122)
  ⚠  4 file(s) with high coupling (>15 imports)

  ─────────────────────────────────────────
  RECOMMENDATIONS
  ─────────────────────────────────────────

  1. 12 file(s) above 300 lines. Consider splitting into smaller modules.
  2. High cyclomatic complexity in "SignupForm". Extract smaller functions.
  3. Reduce inter-module dependencies in coupling hotspots.

  ─────────────────────────────────────────
  Deep analysis: fewcompany.com/radar
  ─────────────────────────────────────────
```

---

## Requisitos

- Node.js >= 20.0.0

---

## English Summary

**archradar** is a free CLI tool that scans your frontend project's architecture and gives you a health score from 0 to 100 with actionable recommendations.

```bash
npx @fewcompany/archradar
```

**What it does:**
- Detects your framework and stack (React, Next.js, Angular, Vue, Svelte)
- Analyzes cyclomatic complexity via AST
- Maps circular dependencies
- Measures coupling density between modules
- Checks dependency health (outdated, unused, high-risk)
- Scores your architecture 0–100 with specific recommendations

No config needed. Just run it.

Built with TypeScript + ts-morph · License: AGPL-3.0 · by [Few Company](https://fewcompany.com)
