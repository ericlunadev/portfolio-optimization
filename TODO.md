# TODO

## 1. Restructure Strategy Menu to 2 Options

Reduce the current 6 optimization strategies to only 2:

- **Markowitz**: Trace the efficient frontier curve and show portfolio composition (% per asset) for each point on the curve.
- **Óptimo de Sharpe**: Use the risk-free rate to draw the Capital Market Line (tangent line) over the frontier curve.

**Files**: `apps/web/src/app/markowitz/page.tsx`, `apps/api/src/lib/math/optimizer.ts`, strategy selection UI.


## 2. Capital Market Line (Tangent Line)

When Óptimo de Sharpe is selected, draw the Capital Market Line from the risk-free rate point tangent to the efficient frontier curve.

**Files**: `apps/web/src/components/charts/ScatterChart.tsx`, backend Sharpe calculation.
