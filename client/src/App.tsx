import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { WorkspaceDensityProvider } from "./contexts/WorkspaceDensityContext";
import Navigation from "./components/Navigation";
import { RequireAdmin, RequireAuth } from "./components/RouteGuard";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const BinanceImport = lazy(() => import("./pages/BinanceImport"));
const Markets = lazy(() => import("./pages/Markets"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const GoldAssetDetail = lazy(() => import("./pages/GoldAssetDetail"));
const GoldChartWorkspace = lazy(() => import("./pages/GoldChartWorkspace"));
const OpportunityScanner = lazy(() => import("./pages/OpportunityScanner"));
const Trading = lazy(() => import("./pages/Trading"));
const Wallet = lazy(() => import("./pages/Wallet"));
const PortfolioPremium = lazy(() => import("./pages/PortfolioPremium"));
const Security = lazy(() => import("./pages/Security"));
const Profile = lazy(() => import("./pages/Profile"));
const Futures = lazy(() => import("./pages/Futures"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Earn = lazy(() => import("./pages/Earn"));
const WatchlistPremium = lazy(() => import("./pages/WatchlistPremium"));
const Orders = lazy(() => import("./pages/Orders"));
const Support = lazy(() => import("./pages/Support"));
const Deposit = lazy(() => import("./pages/Deposit"));
const Withdraw = lazy(() => import("./pages/Withdraw"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const KYC = lazy(() => import("./pages/KYC"));
const RiskSettings = lazy(() => import("./pages/RiskSettings"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const StrategyLab = lazy(() => import("./pages/StrategyLab"));
const StrategyResearch = lazy(() => import("./pages/StrategyResearch"));
const CsvSourceTrust = lazy(() => import("./pages/CsvSourceTrust"));
const ChartWorkspace = lazy(() => import("./pages/ChartWorkspace"));
const Copilot = lazy(() => import("./pages/Copilot"));
const PaperMonitor = lazy(() => import("./pages/PaperMonitor"));
const NexusCommand = lazy(() => import("./pages/NexusCommand"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Billing = lazy(() => import("./pages/Billing"));
const SmartMoney = lazy(() => import("./pages/SmartMoney"));

function RouteLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading workspace"
      className="min-h-[calc(100vh-4rem)] bg-background px-4 py-12 text-foreground sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="h-3 w-28 rounded-full bg-muted" />
        <div className="h-10 w-full max-w-md rounded-xl bg-muted" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-36 rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading workspace</span>
    </main>
  );
}

function Router() {
  // Authenticated surfaces are wrapped in RequireAuth / RequireAdmin below.
  // Server-side procedures remain the real boundary; these guards prevent
  // rendering an admin shell to users who cannot use it.
  return (
    <Switch>
      {/* Premium Exchange Routes */}
      <Route path="/" component={Dashboard} />
      <Route path="/markets" component={Markets} />
      <Route path="/assets/xau-usd" component={GoldAssetDetail} />
      <Route path="/chart/xau-usd" component={GoldChartWorkspace} />
      <Route path="/assets/:id" component={AssetDetail} />
      <Route path="/scanner" component={OpportunityScanner} />
      <Route path="/trading" component={Trading} />
      <Route path="/wallet" component={Wallet} />
      <Route path="/portfolio-premium" component={PortfolioPremium} />
      <Route path="/security" component={Security} />
      <Route path="/profile" component={Profile} />
      <Route path="/futures" component={Futures} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/earn" component={Earn} />
      <Route path="/watchlist-premium" component={WatchlistPremium} />
      <Route path="/orders" component={Orders} />
      <Route path="/support" component={Support} />
      <Route path="/deposit" component={Deposit} />
      <Route path="/withdraw" component={Withdraw} />
      <Route path="/settings" component={Settings} />
      <Route path="/admin"><RequireAdmin><AdminDashboard /></RequireAdmin></Route>
      <Route path="/kyc" component={KYC} />
      <Route path="/risk-settings"><RequireAuth><RiskSettings /></RequireAuth></Route>
      <Route path="/audit-log"><RequireAuth><AuditLog /></RequireAuth></Route>
      <Route path="/strategy-lab" component={StrategyLab} />
      <Route path="/strategy-research" component={StrategyResearch} />
      <Route path="/csv-source-trust" component={CsvSourceTrust} />
      <Route path="/chart" component={ChartWorkspace} />
      <Route path="/copilot" component={Copilot} />
      <Route path="/monitor" component={PaperMonitor} />
      <Route path="/nexus-command" component={NexusCommand} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/billing" component={Billing} />
      <Route path="/smart-money" component={SmartMoney} />
      
      {/* Legacy Routes */}
      <Route path="/legacy-home" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/watchlist" component={Watchlist} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/binance-import" component={BinanceImport} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook
// - Premium Exchange uses dark theme with glassmorphism and gradients

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        switchable
      >
        <LanguageProvider>
          <WorkspaceDensityProvider>
            <TooltipProvider>
              <Toaster position="top-right" />
              <Navigation>
                <Suspense fallback={<RouteLoading />}>
                  <Router />
                </Suspense>
              </Navigation>
            </TooltipProvider>
          </WorkspaceDensityProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
