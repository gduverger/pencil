// @pencil/package-pages — React components for the nine package pages (spec section 8).
export * from './types';
export * from './format';
export { PACKAGE_CSS, PAGE_WIDTH_IN, PAGE_HEIGHT_IN, PDF_MARGIN_TOP_IN, PDF_MARGIN_BOTTOM_IN } from './styles';
export { PackageDocument, planPages } from './document';
export { renderPackageHtml, renderPackageBody, packageFileName } from './render';
export type { RenderHtmlOptions } from './render';
export { registerFromInputs, SECTION_LABELS } from './register';
export { PageFrame, SCENARIO_LABEL } from './pages/Page';
export { SummaryPage } from './pages/Summary';
export { ReturnsPage } from './pages/Returns';
export { SourcesUsesPage } from './pages/SourcesUses';
export { CapitalBudgetPage } from './pages/CapitalBudget';
export { AnnualCashFlowPage } from './pages/AnnualCashFlow';
export { SaleAnalysisPage } from './pages/SaleAnalysis';
export { SensitivitiesPage, SensitivityGrid } from './pages/Sensitivities';
export { AssumptionsPage } from './pages/Assumptions';
export { AppendixPage } from './pages/Appendix';
export { NoiDebtServiceChart, SourcesDonut, EquityBars, heatColor } from './charts';
