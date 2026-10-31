# Task list: extras

Plan: [extras-plan.md](extras-plan.md). Spec: [../docs/SPEC-extras.md](../docs/SPEC-extras.md). Tests first.

## A. Shopping list

- [x] **A-X1: Database** — `20261161_shopping`, `20261162_shopping_expense`, `20261163_shopping_retention`, pgTAP `shopping.test.sql`, `shopping-expense.test.sql`, `pnpm db:types`.
- [x] **A-X2: App** — Vitest first (schemas, description builder, errors, list sections), readers, actions, `/more/shopping`, `/more/shopping/buy`, More row, budgets.
- [x] **A-X3: Finish** — `e2e/shopping.spec.ts`, privacy rows, DEPLOY phone checklist.

## B. Bin days (after A is live)

- [x] B-X1 db (169, 170, PR 93) · [x] B-X2 app (`collectionsBetween` + parity vectors) · [x] B-X3 e2e/docs (one PR for X2 and X3)

## E. Noticeboard (after B)

- [x] E-X1 db (193, 194, PR 95) · [x] E-X2 app · [x] E-X3 e2e/docs (one PR for X2 and X3)

## D. Fix-it log (after E)

- [x] D-X1 db (185–187, PR 97) · [x] D-X2 app · [x] D-X3 e2e/docs (one PR for X2 and X3)

## C. Meter readings (after D)

- [x] C-X1 db (177, 178, PR 100) · [x] C-X2 app (`usageBetween`) · [x] C-X3 e2e/docs (one PR; also removes the More placeholder)

## Progress notes

- A shopping list merged (PRs 90 to 92). B bin days: database in PR 93; screens, e2e and docs in the next PR.
