/**
 * `explain(outputs, cellRef)` returns the operands and formula behind an output cell as data
 * (10.2). The assistant turns the trace into sentences; it never adds numbers of its own.
 */
import { getPath } from './paths';
import type { DealOutputs, Line } from './types';

export interface Operand {
  name: string;
  value: number | string | null;
  unit?: string;
  /** A cellRef or input path the operand comes from, when it has one. */
  ref?: string;
}

export interface ExplainTrace {
  cellRef: string;
  label: string;
  formula: string;
  operands: Operand[];
  value: number | string | null;
  unit: string;
  notes: string[];
}

type Explainer = (o: DealOutputs, m: RegExpMatchArray) => Omit<ExplainTrace, 'cellRef'> | undefined;

const money = (name: string, value: number, ref?: string): Operand => ({
  name,
  value,
  unit: 'usd',
  ...(ref ? { ref } : {}),
});
const rate = (name: string, value: number, ref?: string): Operand => ({
  name,
  value,
  unit: 'rate_pct',
  ...(ref ? { ref } : {}),
});
const count = (name: string, value: number, unit = 'count', ref?: string): Operand => ({
  name,
  value,
  unit,
  ...(ref ? { ref } : {}),
});

function seriesSummary(name: string, series: number[]): Operand[] {
  const contributions = series.filter((x) => x < 0).reduce((s, x) => s - x, 0);
  const distributions = series.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  return [
    money(`${name}: total outflows`, contributions),
    money(`${name}: total inflows`, distributions),
    count(`${name}: months`, series.length, 'months'),
  ];
}

function irrSeries(o: DealOutputs, which: 'project' | 'lp' | 'gp' | 'unlevered'): number[] {
  const tl = o.timeline;
  return o.months.map((m) => {
    switch (which) {
      case 'project':
        return -(m.contributions.gp + m.contributions.lp) + m.distributions.gp + m.distributions.lp;
      case 'lp':
        return -m.contributions.lp + m.distributions.lp;
      case 'gp':
        return -m.contributions.gp + m.distributions.gp;
      case 'unlevered': {
        const capitalized =
          m.costTotal -
          m.costs.financingFees -
          m.costs.capitalizedInterest -
          m.costs.operatingDeficit;
        let u = -capitalized + m.inflows;
        if (m.t >= tl.O) u += m.noi;
        if (m.t === tl.S) u += o.sale.value - o.sale.sellingCosts;
        return u;
      }
    }
  });
}

function linesAsOperands(lines: Line[]): Operand[] {
  return lines.map((l) => money(l.label, l.amount, `sourcesUses.uses.${l.key}`));
}

const exact: Record<string, Explainer> = {
  'metrics.yieldOnCost': (o) => ({
    label: 'Yield on cost',
    formula: 'Σ NOI(Z .. Z+11) / total project cost',
    operands: [
      money(
        'Stabilized NOI (first 12 months from Z)',
        o.metrics.stabilizedNoi ?? 0,
        'metrics.stabilizedNoi',
      ),
      money('Total project cost', o.totals.tpc, 'totals.tpc'),
      count('Z (stabilization month)', o.timeline.Z, 'months'),
    ],
    value: o.metrics.yieldOnCost,
    unit: 'rate_pct',
    notes: [],
  }),
  'metrics.developmentSpread': (o) => ({
    label: 'Development spread',
    formula: 'yield on cost − exit cap rate',
    operands: [
      rate('Yield on cost', o.metrics.yieldOnCost ?? 0, 'metrics.yieldOnCost'),
      rate('Exit cap rate', o.inputs.exit.exitCapRatePct, 'exit.exitCapRatePct'),
    ],
    value: o.metrics.developmentSpread,
    unit: 'rate_pct',
    notes: [],
  }),
  'metrics.equityMultiple': (o) => ({
    label: 'Equity multiple',
    formula: 'Σ distributions / Σ contributions',
    operands: [
      money('Total distributions', o.totals.totalDistributions, 'totals.totalDistributions'),
      money('Total contributions', o.totals.totalContributions, 'totals.totalContributions'),
    ],
    value: o.metrics.equityMultiple,
    unit: 'count',
    notes: [],
  }),
  'metrics.lpMultiple': (o) => ({
    label: 'LP equity multiple',
    formula: 'Σ LP distributions / Σ LP contributions',
    operands: [
      money('LP distributions', o.waterfall.byPartner.lp.distributions),
      money('LP contributions', o.waterfall.byPartner.lp.contributions),
    ],
    value: o.metrics.lpMultiple,
    unit: 'count',
    notes: [],
  }),
  'metrics.gpMultiple': (o) => ({
    label: 'GP equity multiple',
    formula: 'Σ GP distributions / Σ GP contributions',
    operands: [
      money('GP distributions', o.waterfall.byPartner.gp.distributions),
      money('GP contributions', o.waterfall.byPartner.gp.contributions),
    ],
    value: o.metrics.gpMultiple,
    unit: 'count',
    notes: [],
  }),
  'metrics.profit': (o) => ({
    label: 'Profit',
    formula: 'Σ distributions − Σ contributions',
    operands: [
      money('Total distributions', o.totals.totalDistributions, 'totals.totalDistributions'),
      money('Total contributions', o.totals.totalContributions, 'totals.totalContributions'),
    ],
    value: o.metrics.profit,
    unit: 'usd',
    notes: [],
  }),
  'metrics.peakEquity': (o) => ({
    label: 'Peak equity',
    formula: 'max over t of (Σ contributions through t − Σ distributions through t)',
    operands: [
      money('Development equity', o.totals.equity, 'totals.equity'),
      money('Total contributions', o.totals.totalContributions, 'totals.totalContributions'),
    ],
    value: o.metrics.peakEquity,
    unit: 'usd',
    notes: [],
  }),
  'metrics.projectIrr': (o) => ({
    label: 'Project (levered) IRR',
    formula: 'annual IRR of (−contributions_t + distributions_t), all partners; (1 + irr_m)^12 − 1',
    operands: seriesSummary('Equity series', irrSeries(o, 'project')),
    value: o.metrics.projectIrr,
    unit: 'rate_pct',
    notes:
      o.metrics.projectIrr === null
        ? ['The series has no sign change or no root in [−0.99, 10], so the IRR is undefined.']
        : [],
  }),
  'metrics.lpIrr': (o) => ({
    label: 'LP IRR',
    formula: 'annual IRR of (−LP contributions_t + LP distributions_t)',
    operands: seriesSummary('LP series', irrSeries(o, 'lp')),
    value: o.metrics.lpIrr,
    unit: 'rate_pct',
    notes: [],
  }),
  'metrics.gpIrr': (o) => ({
    label: 'GP IRR',
    formula: 'annual IRR of (−GP contributions_t + GP distributions_t)',
    operands: seriesSummary('GP series', irrSeries(o, 'gp')),
    value: o.metrics.gpIrr,
    unit: 'rate_pct',
    notes: [],
  }),
  'metrics.unleveredIrr': (o) => ({
    label: 'Unlevered IRR',
    formula:
      'annual IRR of (−capitalized costs excluding loan fees and interest + inflow events + NOI(t) for t ≥ O, plus V_S − selling costs at S)',
    operands: [
      ...seriesSummary('Unlevered series', irrSeries(o, 'unlevered')),
      money('Sale value', o.sale.value, 'sale.value'),
      money('Selling costs', o.sale.sellingCosts, 'sale.sellingCosts'),
    ],
    value: o.metrics.unleveredIrr,
    unit: 'rate_pct',
    notes: [],
  }),
  'metrics.totalProjectCost': (o) => ({
    label: 'Total project cost',
    formula:
      'Σ uses (land, closing, hard, contingencies, soft, carry, developer fee, TI, events, financing fees, capitalized interest, operating deficit)',
    operands: linesAsOperands(o.sourcesUses.uses),
    value: o.totals.tpc,
    unit: 'usd',
    notes: [],
  }),
  'metrics.costPerUnit': (o) => ({
    label: 'Cost per unit',
    formula: 'total project cost / total units',
    operands: [
      money('Total project cost', o.totals.tpc, 'totals.tpc'),
      count('Total units', o.program.totalUnits, 'units', 'program.totalUnits'),
    ],
    value: o.metrics.costPerUnit,
    unit: 'usd_per_unit',
    notes: [],
  }),
  'metrics.costPerGSF': (o) => ({
    label: 'Cost per gross SF',
    formula: 'total project cost / GSF_total',
    operands: [
      money('Total project cost', o.totals.tpc, 'totals.tpc'),
      count('Gross SF (incl. commercial)', o.program.gsfTotal, 'sf', 'program.gsfTotal'),
    ],
    value: o.metrics.costPerGSF,
    unit: 'usd_per_sf',
    notes: [],
  }),
  'metrics.stabilizedNoi': (o) => ({
    label: 'Stabilized NOI',
    formula: 'Σ NOI(Z .. Z+11)',
    operands: o.months
      .slice(o.timeline.Z, o.timeline.Z + 12)
      .map((m) => money(`NOI month ${m.t}`, m.noi, `months[${m.t}].noi`)),
    value: o.metrics.stabilizedNoi,
    unit: 'usd',
    notes: [],
  }),
  'metrics.saleValue': (o) => exact['sale.value']!(o, [] as unknown as RegExpMatchArray),
  'metrics.netToEquityAtSale': (o) =>
    exact['sale.netToEquity']!(o, [] as unknown as RegExpMatchArray),
  'metrics.permanentLoan': (o) => exact['refinance.loan']!(o, [] as unknown as RegExpMatchArray),
  'metrics.constructionLoan': (o) =>
    exact['totals.constructionLoan']!(o, [] as unknown as RegExpMatchArray),
  'metrics.capitalizedInterest': (o) =>
    exact['totals.capitalizedInterest']!(o, [] as unknown as RegExpMatchArray),
  'metrics.totalEquity': (o) => ({
    label: 'Total equity contributed',
    formula:
      'development equity (TPC − Lc − M, incl. in-kind land) + refinance shortfall + non-capitalized deficits',
    operands: [
      money('Development equity', o.totals.equity, 'totals.equity'),
      money('Equity commitment E', o.totals.equityCommitment, 'totals.equityCommitment'),
      money('Total contributions', o.totals.totalContributions, 'totals.totalContributions'),
    ],
    value: o.metrics.totalEquity,
    unit: 'usd',
    notes: [],
  }),
  'sale.noiForward': (o) => ({
    label: 'Forward 12-month NOI at sale',
    formula: 'Σ NOI(S+1 .. S+12)',
    operands: o.forwardNoi.map((v, i) => money(`NOI month ${o.timeline.S + 1 + i}`, v)),
    value: o.sale.noiForward,
    unit: 'usd',
    notes: [],
  }),
  'sale.value': (o) => ({
    label: 'Gross sale value',
    formula: 'Σ NOI(S+1 .. S+12) / exit cap rate',
    operands: [
      money('Forward 12-month NOI', o.sale.noiForward, 'sale.noiForward'),
      rate('Exit cap rate', o.sale.capRate, 'exit.exitCapRatePct'),
    ],
    value: o.sale.value,
    unit: 'usd',
    notes: [],
  }),
  'sale.sellingCosts': (o) => ({
    label: 'Selling costs',
    formula: '(broker fee % + closing cost %) × gross sale value',
    operands: [
      rate('Broker fee', o.inputs.exit.brokerFeePct, 'exit.brokerFeePct'),
      rate('Closing costs', o.inputs.exit.closingCostPct, 'exit.closingCostPct'),
      money('Gross sale value', o.sale.value, 'sale.value'),
    ],
    value: o.sale.sellingCosts,
    unit: 'usd',
    notes: [],
  }),
  'sale.payoff': (o) => ({
    label: 'Debt payoff at sale',
    formula: 'loan balance at S + mezzanine balance (if repaid at sale)',
    operands: [
      money('Loan balance at S', o.sale.loanPayoff),
      money('Mezzanine payoff', o.sale.mezzPayoff),
    ],
    value: o.sale.payoff,
    unit: 'usd',
    notes: [],
  }),
  'sale.netToEquity': (o) => ({
    label: 'Net sale proceeds to equity',
    formula: 'gross sale value − selling costs − debt payoff',
    operands: [
      money('Gross sale value', o.sale.value, 'sale.value'),
      money('Selling costs', o.sale.sellingCosts, 'sale.sellingCosts'),
      money('Debt payoff', o.sale.payoff, 'sale.payoff'),
    ],
    value: o.sale.netToEquity,
    unit: 'usd',
    notes:
      o.sale.netToEquity < 0
        ? ['Negative: the sale does not cover the debt and selling costs.']
        : [],
  }),
  'refinance.noi12': (o) =>
    o.refinance
      ? {
          label: 'NOI for sizing the permanent loan',
          formula: 'Σ NOI(R .. R+11)',
          operands: o.months
            .slice(o.refinance.month, o.refinance.month + 12)
            .map((m) => money(`NOI month ${m.t}`, m.noi, `months[${m.t}].noi`)),
          value: o.refinance.noi12,
          unit: 'usd',
          notes: [],
        }
      : undefined,
  'refinance.value': (o) =>
    o.refinance
      ? {
          label: 'Value at refinance',
          formula: 'NOI12 / refinance cap rate',
          operands: [
            money('NOI12', o.refinance.noi12, 'refinance.noi12'),
            rate('Refinance cap rate', o.refinance.capRate, 'financing.permanent.refiCapRatePct'),
          ],
          value: o.refinance.value,
          unit: 'usd',
          notes: [],
        }
      : undefined,
  'refinance.loanLTV': (o) =>
    o.refinance
      ? {
          label: 'Loan at maximum LTV',
          formula: 'max LTV × value at refinance',
          operands: [
            rate('Max LTV', o.inputs.financing.permanent.maxLTV, 'financing.permanent.maxLTV'),
            money('Value at refinance', o.refinance.value, 'refinance.value'),
          ],
          value: o.refinance.loanLTV,
          unit: 'usd',
          notes: [],
        }
      : undefined,
  'refinance.loanDSCR': (o) =>
    o.refinance
      ? {
          label: 'Loan at minimum DSCR',
          formula:
            'NOI12 / (DSCR_min × 12) × (1 − (1 + i)^−n) / i, with i = rate / 12 and n = 12 × amortization years',
          operands: [
            money('NOI12', o.refinance.noi12, 'refinance.noi12'),
            count(
              'Minimum DSCR',
              o.inputs.financing.permanent.minDSCR,
              'count',
              'financing.permanent.minDSCR',
            ),
            rate(
              'Permanent rate',
              o.inputs.financing.permanent.ratePct,
              'financing.permanent.ratePct',
            ),
            count(
              'Amortization years',
              o.inputs.financing.permanent.amortYears,
              'count',
              'financing.permanent.amortYears',
            ),
          ],
          value: o.refinance.loanDSCR,
          unit: 'usd',
          notes: [],
        }
      : undefined,
  'refinance.loan': (o) =>
    o.refinance
      ? {
          label: 'Permanent loan',
          formula: 'min(loan at max LTV, loan at min DSCR)',
          operands: [
            money('Loan at max LTV', o.refinance.loanLTV, 'refinance.loanLTV'),
            money('Loan at min DSCR', o.refinance.loanDSCR, 'refinance.loanDSCR'),
          ],
          value: o.refinance.loan,
          unit: 'usd',
          notes: [],
        }
      : {
          label: 'Permanent loan',
          formula: 'no permanent loan (switch off)',
          operands: [],
          value: 0,
          unit: 'usd',
          notes: [
            'The permanent refinance switch is off; the construction loan stays outstanding until the sale.',
          ],
        },
  'refinance.net': (o) =>
    o.refinance
      ? {
          label: 'Net refinance proceeds',
          formula: 'permanent loan − fee − construction loan payoff − mezzanine payoff',
          operands: [
            money('Permanent loan', o.refinance.loan, 'refinance.loan'),
            money('Fee', o.refinance.fee),
            money('Construction loan payoff', o.refinance.constructionPayoff),
            money('Mezzanine payoff', o.refinance.mezzPayoff),
          ],
          value: o.refinance.net,
          unit: 'usd',
          notes:
            o.refinance.net < 0
              ? ['Negative: equity contributes the shortfall pro rata at the refinance month.']
              : [],
        }
      : undefined,
  'totals.tpc': (o) => exact['metrics.totalProjectCost']!(o, [] as unknown as RegExpMatchArray),
  'totals.equity': (o) => ({
    label: 'Development equity',
    formula: 'cash equity called in order + in-kind land; the commitment is E = TPC − Lc − M',
    operands: [
      money('Cash equity', o.totals.equityCash),
      money('In-kind land', o.totals.equityInKind),
      money('Commitment E', o.totals.equityCommitment, 'totals.equityCommitment'),
      money('TPC', o.totals.tpc, 'totals.tpc'),
      money('Construction loan commitment Lc', o.totals.constructionLoanCommitment),
      money('Mezzanine commitment M', o.totals.mezzCommitment),
    ],
    value: o.totals.equity,
    unit: 'usd',
    notes: [],
  }),
  'totals.constructionLoan': (o) => ({
    label: 'Construction loan',
    formula:
      'Σ draws + Σ capitalized interest (balance at the refinance month); commitment Lc = LTC × TPC',
    operands: [
      money(
        'Draws',
        o.months.filter((m) => m.t <= o.timeline.R).reduce((s, m) => s + m.loanDraw, 0),
      ),
      money(
        'Capitalized interest',
        o.months.reduce((s, m) => s + m.interestBreakdown.construction, 0),
      ),
      rate(
        'Loan-to-cost',
        o.inputs.financing.constructionLoan.ltc,
        'financing.constructionLoan.ltc',
      ),
      money('Commitment Lc', o.totals.constructionLoanCommitment),
    ],
    value: o.totals.constructionLoan,
    unit: 'usd',
    notes: [],
  }),
  'totals.capitalizedInterest': (o) => ({
    label: 'Capitalized interest',
    formula:
      'Σ over months ≤ R of B_{t−1} × rate / 12 for the construction, land and mezzanine loans',
    operands: [
      money(
        'Construction loan interest',
        o.months.reduce((s, m) => s + m.interestBreakdown.construction, 0),
      ),
      money(
        'Land loan interest',
        o.months.reduce((s, m) => s + m.interestBreakdown.land, 0),
      ),
      money(
        'Mezzanine interest',
        o.months.reduce((s, m) => s + m.interestBreakdown.mezz, 0),
      ),
      rate(
        'Construction loan rate',
        o.inputs.financing.constructionLoan.ratePct,
        'financing.constructionLoan.ratePct',
      ),
    ],
    value: o.totals.capitalizedInterest,
    unit: 'usd',
    notes: [],
  }),
  'program.gsf': (o) => ({
    label: 'Residential gross SF',
    formula: 'NRSF / efficiency',
    operands: [
      count('NRSF', o.program.nrsf, 'sf', 'program.nrsf'),
      rate('Efficiency', o.program.efficiency, 'program.efficiency'),
    ],
    value: o.program.gsf,
    unit: 'sf',
    notes: [],
  }),
  'program.gsfTotal': (o) => ({
    label: 'Total gross SF',
    formula: 'residential GSF + commercial gross SF (when on)',
    operands: [
      count('Residential GSF', o.program.gsf, 'sf', 'program.gsf'),
      count('Commercial SF', o.program.commercialSF, 'sf', 'program.commercial.grossSF'),
    ],
    value: o.program.gsfTotal,
    unit: 'sf',
    notes: [],
  }),
  'program.nrsf': (o) => ({
    label: 'Net rentable SF',
    formula: 'Σ units_i × avgSF_i',
    operands: o.program.unitTypes.map((u) =>
      count(`${u.key}: ${u.units} units × ${u.avgSF} SF`, u.nrsf, 'sf'),
    ),
    value: o.program.nrsf,
    unit: 'sf',
    notes: [],
  }),
};

const patterns: Array<[RegExp, Explainer]> = [
  [
    /^program\.unitTypes\[([^\]]+)\]\.units$/,
    (o, m) => {
      const u = o.program.unitTypes.find((x) => x.key === m[1]);
      if (!u) return undefined;
      return {
        label: `${u.key} units`,
        formula:
          'round(totalUnits × mixPct) with largest-remainder correction so the types sum to totalUnits',
        operands: [
          count('Total units', o.program.totalUnits, 'units', 'program.totalUnits'),
          rate('Mix share', u.mixPct, `program.unitTypes[${u.key}].mixPct`),
        ],
        value: u.units,
        unit: 'units',
        notes: [],
      };
    },
  ],
  [
    /^months\[(\d+)\]\.(noi|egi|gpr|occupancy|opexTotal|interest|loanBalance|cashFlowAfterDebt)$/,
    (o, m) => {
      const t = Number(m[1]);
      const row = o.months[t];
      if (!row) return undefined;
      const field = m[2]!;
      const prev = o.months[t - 1];
      switch (field) {
        case 'noi':
          return {
            label: `NOI, month ${t}`,
            formula: 'EGI − operating expenses',
            operands: [
              money('EGI', row.egi, `months[${t}].egi`),
              money('Operating expenses', row.opexTotal, `months[${t}].opexTotal`),
            ],
            value: row.noi,
            unit: 'usd',
            notes: [],
          };
        case 'egi':
          return {
            label: `EGI, month ${t}`,
            formula:
              'GPR × occupancy × (1 − credit loss) + other income × occupancy + commercial income',
            operands: [
              money('GPR', row.gpr, `months[${t}].gpr`),
              count('Occupancy', row.occupancy, 'pct', `months[${t}].occupancy`),
              rate('Credit loss', o.inputs.operations.creditLossPct, 'operations.creditLossPct'),
              money('Other income (potential)', row.otherIncome),
              money('Commercial income', row.commercialIncome),
            ],
            value: row.egi,
            unit: 'usd',
            notes: [],
          };
        case 'gpr':
          return {
            label: `Gross potential rent, month ${t}`,
            formula: 'Σ units_i × rent_i × (1 + rent growth)^floor(t / 12)',
            operands: [
              ...o.program.unitTypes.map((u) =>
                money(
                  `${u.key}: ${u.units} × rent`,
                  u.units * u.rentPerMonth,
                  `program.unitTypes[${u.key}].rentPerMonth`,
                ),
              ),
              rate('Rent growth', o.inputs.operations.rentGrowthPct, 'operations.rentGrowthPct'),
              count('Year index floor(t/12)', Math.floor(t / 12)),
            ],
            value: row.gpr,
            unit: 'usd',
            notes: [],
          };
        case 'occupancy':
          return {
            label: `Occupancy, month ${t}`,
            formula:
              o.inputs.operations.absorption.kind === 'linear'
                ? 'occ_s × min(1, (t − O + 1) / L); occ_s from Z'
                : 'min(occ_s, units per month × (t − O + 1) / total units); occ_s from Z',
            operands: [
              rate(
                'Stabilized vacancy',
                o.inputs.operations.stabilizedVacancyPct,
                'operations.stabilizedVacancyPct',
              ),
              count('O', o.timeline.O, 'months'),
              count('Z', o.timeline.Z, 'months'),
            ],
            value: row.occupancy,
            unit: 'pct',
            notes: [],
          };
        case 'opexTotal':
          return {
            label: `Operating expenses, month ${t}`,
            formula:
              'Σ per-unit lines × units / 12 × growth + taxes / 12 × growth + management % × EGI + commercial opex',
            operands: Object.entries(row.opex).map(([k, v]) => money(k, v)),
            value: row.opexTotal,
            unit: 'usd',
            notes: [],
          };
        case 'interest':
          return {
            label: `Capitalized interest, month ${t}`,
            formula: 'B_{t−1} × rate / 12 for each loan',
            operands: [
              money('Construction balance, prior month', prev?.loanBalance ?? 0),
              rate(
                'Construction rate',
                o.inputs.financing.constructionLoan.ratePct,
                'financing.constructionLoan.ratePct',
              ),
              money('Land loan balance, prior month', prev?.landLoanBalance ?? 0),
              money('Mezzanine balance, prior month', prev?.mezzBalance ?? 0),
            ],
            value: row.interest,
            unit: 'usd',
            notes: [],
          };
        case 'loanBalance':
          return {
            label: `Construction loan balance, month ${t}`,
            formula: 'B_{t−1} + draw_t + interest_t',
            operands: [
              money('Prior balance', prev?.loanBalance ?? 0),
              money('Draw', row.loanDraw),
              money('Interest', row.interestBreakdown.construction),
            ],
            value: row.loanBalance,
            unit: 'usd',
            notes: [],
          };
        default:
          return {
            label: `Cash flow after debt, month ${t}`,
            formula:
              'NOI − debt service + inflow events + refinance net + sale proceeds (operating regime, t ≥ R)',
            operands: [
              money('NOI', row.noi, `months[${t}].noi`),
              money('Debt service', row.debtService.interest + row.debtService.principal),
              money('Refinance net', row.refinance),
              money('Sale proceeds', row.saleProceeds),
              money('Inflow events', row.inflows),
            ],
            value: row.cashFlowAfterDebt,
            unit: 'usd',
            notes: [],
          };
      }
    },
  ],
  [
    /^annual\[(\d+)\]\.(noi|dscr|cashOnCash|egi|cashFlow)$/,
    (o, m) => {
      const y = Number(m[1]);
      const row = o.annual[y];
      if (!row) return undefined;
      const field = m[2]!;
      const months = o.months.slice(row.fromMonth, row.toMonth + 1);
      switch (field) {
        case 'noi':
          return {
            label: `NOI, year ${row.year}`,
            formula: 'Σ monthly NOI over the year',
            operands: months.map((x) => money(`Month ${x.t}`, x.noi, `months[${x.t}].noi`)),
            value: row.noi,
            unit: 'usd',
            notes: [],
          };
        case 'egi':
          return {
            label: `EGI, year ${row.year}`,
            formula: 'Σ monthly EGI over the year',
            operands: months.map((x) => money(`Month ${x.t}`, x.egi, `months[${x.t}].egi`)),
            value: row.egi,
            unit: 'usd',
            notes: [],
          };
        case 'dscr':
          return {
            label: `DSCR, year ${row.year}`,
            formula: 'NOI_year / debt service_year',
            operands: [
              money('NOI', row.noi, `annual[${y}].noi`),
              money('Debt service', row.debtService.total),
            ],
            value: row.dscr,
            unit: 'count',
            notes: row.dscr === null ? ['No debt service in this year.'] : [],
          };
        case 'cashOnCash': {
          const cumulative = o.months
            .slice(0, row.toMonth + 1)
            .reduce((s, x) => s + x.contributions.gp + x.contributions.lp, 0);
          return {
            label: `Cash-on-cash, year ${row.year}`,
            formula: '(NOI_year − debt service_year) / cumulative contributions at year end',
            operands: [
              money('NOI', row.noi, `annual[${y}].noi`),
              money('Debt service', row.debtService.total),
              money('Cumulative contributions', cumulative),
            ],
            value: row.cashOnCash,
            unit: 'rate_pct',
            notes: [],
          };
        }
        default:
          return {
            label: `Cash flow after debt service, year ${row.year}`,
            formula: 'NOI_year − debt service_year',
            operands: [
              money('NOI', row.noi, `annual[${y}].noi`),
              money('Debt service', row.debtService.total),
            ],
            value: row.cashFlow,
            unit: 'usd',
            notes: [],
          };
      }
    },
  ],
];

export function explain(outputs: DealOutputs, cellRef: string): ExplainTrace {
  const direct = exact[cellRef];
  if (direct) {
    const trace = direct(outputs, [] as unknown as RegExpMatchArray);
    if (trace) return { cellRef, ...trace };
  }
  for (const [re, fn] of patterns) {
    const m = cellRef.match(re);
    if (m) {
      const trace = fn(outputs, m);
      if (trace) return { cellRef, ...trace };
    }
  }
  const value = getPath(outputs, cellRef);
  const scalar =
    typeof value === 'number' || typeof value === 'string' || value === null
      ? value
      : value === undefined
        ? null
        : JSON.stringify(value);
  return {
    cellRef,
    label: cellRef,
    formula: 'value',
    operands: [],
    value: scalar,
    unit: typeof value === 'number' ? 'usd' : 'text',
    notes:
      value === undefined
        ? ['No such cell.']
        : ['No derivation is recorded for this cell; the value is shown as is.'],
  };
}

/** Every cellRef with a recorded derivation (metrics, sale, refinance, totals, program), for the UI. */
export function explainableCells(): string[] {
  return Object.keys(exact);
}
