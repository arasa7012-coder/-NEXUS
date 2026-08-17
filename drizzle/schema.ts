import { decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** User-selected market instruments. Entries express monitoring intent only, never custody or ownership. */
export const marketWatchlistEntries = mysqlTable("marketWatchlistEntries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  assetId: varchar("assetId", { length: 80 }).notNull(),
  assetType: mysqlEnum("assetType", ["CRYPTO", "STABLECOIN", "COMMODITY", "FOREX", "STOCK", "INDEX", "REAL_WORLD_ASSET"]).notNull(),
  symbol: varchar("symbol", { length: 30 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("marketWatchlistEntries_user_asset_unique").on(table.userId, table.assetId),
  index("marketWatchlistEntries_user_updated_idx").on(table.userId, table.updatedAt),
]);

// TODO: Add your tables here

export const cryptocurrencies = mysqlTable("cryptocurrencies", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull().unique(), // e.g., BTC, ETH
  name: varchar("name", { length: 50 }).notNull(), // e.g., Bitcoin, Ethereum
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const candles = mysqlTable("candles", {
  id: int("id").autoincrement().primaryKey(),
  cryptoId: int("cryptoId").notNull().references(() => cryptocurrencies.id),
  timeframe: varchar("timeframe", { length: 10 }).notNull(), // e.g., 1m, 5m, 1h, 1d
  open: varchar("open", { length: 20 }).notNull(),
  high: varchar("high", { length: 20 }).notNull(),
  low: varchar("low", { length: 20 }).notNull(),
  close: varchar("close", { length: 20 }).notNull(),
  volume: varchar("volume", { length: 30 }).notNull(),
  timestamp: timestamp("timestamp").notNull(), // UTC timestamp of the candle start
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  cryptoId: int("cryptoId").notNull().references(() => cryptocurrencies.id),
  type: mysqlEnum("type", ["price_level", "ta_signal", "ai_signal"]).notNull(),
  condition: text("condition").notNull(), // e.g., "price > 50000", "RSI > 70"
  isActive: int("isActive").default(1).notNull(), // 1 for active, 0 for inactive
  triggeredAt: timestamp("triggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aiPredictions = mysqlTable("aiPredictions", {
  id: int("id").autoincrement().primaryKey(),
  cryptoId: int("cryptoId").notNull().references(() => cryptocurrencies.id),
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  prediction: mysqlEnum("prediction", ["BUY", "SELL", "HOLD"]).notNull(),
  explanation: text("explanation").notNull(),
  sentimentScore: varchar("sentimentScore", { length: 10 }), // e.g., "0.75" for positive sentiment
  newsSummary: text("newsSummary"),
  timestamp: timestamp("timestamp").notNull(), // UTC timestamp of the prediction
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const portfolios = mysqlTable("portfolios", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 100 }).notNull().default("My Portfolio"),
  description: text("description"),
  isDefault: int("isDefault").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const portfolioAssets = mysqlTable("portfolioAssets", {
  id: int("id").autoincrement().primaryKey(),
  portfolioId: int("portfolioId").notNull().references(() => portfolios.id),
  cryptoId: int("cryptoId").notNull().references(() => cryptocurrencies.id),
  quantity: varchar("quantity", { length: 30 }).notNull(),
  purchasePrice: varchar("purchasePrice", { length: 20 }).notNull(),
  purchaseDate: timestamp("purchaseDate").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = typeof portfolios.$inferInsert;
export type PortfolioAsset = typeof portfolioAssets.$inferSelect;
export type InsertPortfolioAsset = typeof portfolioAssets.$inferInsert;

export const binanceApiKeys = mysqlTable("binanceApiKeys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  apiKey: text("apiKey").notNull(), // Encrypted
  apiSecret: text("apiSecret").notNull(), // Encrypted
  label: varchar("label", { length: 100 }), // e.g., "Main Account", "Trading Bot"
  isActive: int("isActive").default(1).notNull(), // 1 for active, 0 for inactive
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BinanceApiKey = typeof binanceApiKeys.$inferSelect;
export type InsertBinanceApiKey = typeof binanceApiKeys.$inferInsert;


// In-app notifications table
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["price_alert", "portfolio_update", "trade_signal", "system"]).notNull(),
  relatedCryptoId: int("relatedCryptoId").references(() => cryptocurrencies.id),
  isRead: int("isRead").default(0).notNull(),
  actionUrl: varchar("actionUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Portfolio performance tracking
export const portfolioSnapshots = mysqlTable("portfolioSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  portfolioId: int("portfolioId").notNull().references(() => portfolios.id),
  totalValue: varchar("totalValue", { length: 30 }).notNull(), // Total portfolio value at snapshot time
  totalCost: varchar("totalCost", { length: 30 }).notNull(), // Total cost basis
  totalProfit: varchar("totalProfit", { length: 30 }).notNull(), // Total profit/loss
  profitPercentage: varchar("profitPercentage", { length: 10 }).notNull(), // Profit percentage
  snapshotDate: timestamp("snapshotDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type InsertPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;

/**
 * Application-owned virtual ledger. It never represents an exchange account,
 * custody balance, credential, or real order-execution relationship.
 */
export const simulationPortfolios = mysqlTable("simulationPortfolios", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull().default("Simulation Portfolio"),
  quoteCurrency: varchar("quoteCurrency", { length: 10 }).notNull().default("USD"),
  initialCashUsd: decimal("initialCashUsd", { precision: 24, scale: 2 }).notNull().default("100000.00"),
  cashBalanceUsd: decimal("cashBalanceUsd", { precision: 24, scale: 2 }).notNull().default("100000.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("simulationPortfolios_userId_unique").on(table.userId),
]);

/** Virtual holdings created only from confirmed simulation transactions. */
export const simulationPositions = mysqlTable("simulationPositions", {
  id: int("id").autoincrement().primaryKey(),
  simulationPortfolioId: int("simulationPortfolioId").notNull(),
  symbol: varchar("symbol", { length: 15 }).notNull(),
  quantity: decimal("quantity", { precision: 30, scale: 12 }).notNull(),
  averageCostUsd: decimal("averageCostUsd", { precision: 24, scale: 8 }).notNull(),
  stopMethod: mysqlEnum("stopMethod", ["fixed", "atr", "structure"]),
  stopPriceUsd: decimal("stopPriceUsd", { precision: 24, scale: 8 }),
  targetPriceUsd: decimal("targetPriceUsd", { precision: 24, scale: 8 }),
  plannedRiskUsd: decimal("plannedRiskUsd", { precision: 24, scale: 2 }),
  plannedRiskPercent: decimal("plannedRiskPercent", { precision: 8, scale: 4 }),
  riskLevel: mysqlEnum("riskLevel", ["LOW", "MODERATE", "HIGH", "EXTREME"]),
  openingDecisionId: int("openingDecisionId"),
  intelligenceOpportunityScore: decimal("intelligenceOpportunityScore", { precision: 7, scale: 2 }),
  intelligenceRiskScore: decimal("intelligenceRiskScore", { precision: 7, scale: 2 }),
  intelligenceSignalStrength: decimal("intelligenceSignalStrength", { precision: 7, scale: 2 }),
  marketRegime: varchar("marketRegime", { length: 40 }),
  dataQuality: varchar("dataQuality", { length: 20 }),
  dataSource: varchar("dataSource", { length: 80 }),
  providerUpdatedAt: timestamp("providerUpdatedAt"),
  protectionUpdatedAt: timestamp("protectionUpdatedAt"),
  monitorLastEvaluatedAt: timestamp("monitorLastEvaluatedAt"),
  monitorLastPriceUsd: decimal("monitorLastPriceUsd", { precision: 24, scale: 8 }),
  monitorLastRegime: varchar("monitorLastRegime", { length: 40 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("simulationPositions_portfolio_symbol_unique").on(table.simulationPortfolioId, table.symbol),
]);

/** Immutable history for confirmed application-only simulation orders. */
export const simulationTransactions = mysqlTable("simulationTransactions", {
  id: int("id").autoincrement().primaryKey(),
  simulationPortfolioId: int("simulationPortfolioId").notNull(),
  symbol: varchar("symbol", { length: 15 }).notNull(),
  side: mysqlEnum("side", ["buy", "sell"]).notNull(),
  orderType: mysqlEnum("orderType", ["market", "limit", "stop"]).notNull(),
  quantity: decimal("quantity", { precision: 30, scale: 12 }).notNull(),
  referencePriceUsd: decimal("referencePriceUsd", { precision: 24, scale: 8 }).notNull(),
  notionalUsd: decimal("notionalUsd", { precision: 24, scale: 2 }).notNull(),
  marketSource: varchar("marketSource", { length: 40 }).notNull(),
  decisionId: int("decisionId"),
  purpose: mysqlEnum("purpose", ["OPEN", "REDUCE", "PROTECTIVE_STOP", "TAKE_PROFIT"]).default("OPEN").notNull(),
  feeBps: int("feeBps").default(0).notNull(),
  slippageBps: int("slippageBps").default(0).notNull(),
  estimatedFeesUsd: decimal("estimatedFeesUsd", { precision: 24, scale: 2 }).default("0.00").notNull(),
  realizedPnlUsd: decimal("realizedPnlUsd", { precision: 24, scale: 2 }),
  protectionReason: text("protectionReason"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Per-user paper-trading risk configuration. No exchange credentials or execution permissions are stored. */
export const simulationRiskSettings = mysqlTable("simulationRiskSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  riskPerTradePercent: decimal("riskPerTradePercent", { precision: 8, scale: 4 }).notNull().default("1.0000"),
  maxDailyLossPercent: decimal("maxDailyLossPercent", { precision: 8, scale: 4 }).notNull().default("3.0000"),
  maxDailyDrawdownPercent: decimal("maxDailyDrawdownPercent", { precision: 8, scale: 4 }).notNull().default("5.0000"),
  maxOpenPositions: int("maxOpenPositions").notNull().default(10),
  maxPortfolioExposurePercent: decimal("maxPortfolioExposurePercent", { precision: 8, scale: 4 }).notNull().default("80.0000"),
  maxAssetExposurePercent: decimal("maxAssetExposurePercent", { precision: 8, scale: 4 }).notNull().default("25.0000"),
  stopMethod: mysqlEnum("stopMethod", ["fixed", "atr", "structure"]).notNull().default("atr"),
  fixedStopPercent: decimal("fixedStopPercent", { precision: 8, scale: 4 }).notNull().default("2.0000"),
  atrMultiplier: decimal("atrMultiplier", { precision: 8, scale: 4 }).notNull().default("2.0000"),
  structureBufferBps: int("structureBufferBps").notNull().default(10),
  minimumRewardRisk: decimal("minimumRewardRisk", { precision: 8, scale: 4 }).notNull().default("2.0000"),
  consecutiveLossLimit: int("consecutiveLossLimit").notNull().default(3),
  cooldownMinutes: int("cooldownMinutes").notNull().default(60),
  feeBps: int("feeBps").notNull().default(10),
  slippageBps: int("slippageBps").notNull().default(5),
  blockHighVolatility: int("blockHighVolatility").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("simulationRiskSettings_userId_unique").on(table.userId),
]);

/** Persistent per-user safety state for UTC daily protection and Emergency Stop. */
export const simulationSafetyStates = mysqlTable("simulationSafetyStates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  riskDayUtc: varchar("riskDayUtc", { length: 10 }).notNull(),
  dayStartEquityUsd: decimal("dayStartEquityUsd", { precision: 24, scale: 2 }).notNull(),
  dayPeakEquityUsd: decimal("dayPeakEquityUsd", { precision: 24, scale: 2 }).notNull(),
  consecutiveLosses: int("consecutiveLosses").notNull().default(0),
  cooldownUntil: timestamp("cooldownUntil"),
  emergencyStopActive: int("emergencyStopActive").notNull().default(0),
  emergencyStopReason: text("emergencyStopReason"),
  emergencyStopActivatedAt: timestamp("emergencyStopActivatedAt"),
  emergencyStopResetAt: timestamp("emergencyStopResetAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("simulationSafetyStates_userId_unique").on(table.userId),
]);

/** Immutable accepted/rejected paper-trade decision evidence. */
export const simulationTradeDecisions = mysqlTable("simulationTradeDecisions", {
  id: int("id").autoincrement().primaryKey(),
  requestKey: varchar("requestKey", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  simulationPortfolioId: int("simulationPortfolioId").notNull(),
  transactionId: int("transactionId"),
  pendingOrderId: int("pendingOrderId"),
  symbol: varchar("symbol", { length: 15 }).notNull(),
  side: mysqlEnum("side", ["buy", "sell"]).notNull(),
  orderType: mysqlEnum("orderType", ["market", "limit", "stop"]).notNull(),
  entryPriceUsd: decimal("entryPriceUsd", { precision: 24, scale: 8 }).notNull(),
  stopMethod: mysqlEnum("stopMethod", ["fixed", "atr", "structure"]).notNull(),
  stopPriceUsd: decimal("stopPriceUsd", { precision: 24, scale: 8 }).notNull(),
  targetPriceUsd: decimal("targetPriceUsd", { precision: 24, scale: 8 }).notNull(),
  quantity: decimal("quantity", { precision: 30, scale: 12 }).notNull(),
  notionalUsd: decimal("notionalUsd", { precision: 24, scale: 2 }).notNull(),
  estimatedFeesUsd: decimal("estimatedFeesUsd", { precision: 24, scale: 2 }).notNull(),
  plannedRiskUsd: decimal("plannedRiskUsd", { precision: 24, scale: 2 }).notNull(),
  plannedRiskPercent: decimal("plannedRiskPercent", { precision: 8, scale: 4 }).notNull(),
  rewardRiskRatio: decimal("rewardRiskRatio", { precision: 10, scale: 4 }).notNull(),
  riskLevel: mysqlEnum("riskLevel", ["LOW", "MODERATE", "HIGH", "EXTREME"]).notNull(),
  intelligenceOpportunityScore: decimal("intelligenceOpportunityScore", { precision: 7, scale: 2 }),
  intelligenceRiskScore: decimal("intelligenceRiskScore", { precision: 7, scale: 2 }),
  intelligenceSignalStrength: decimal("intelligenceSignalStrength", { precision: 7, scale: 2 }),
  marketRegime: varchar("marketRegime", { length: 40 }),
  dataQuality: varchar("dataQuality", { length: 20 }).notNull(),
  dataSource: varchar("dataSource", { length: 80 }).notNull(),
  providerUpdatedAt: timestamp("providerUpdatedAt"),
  decision: mysqlEnum("decision", ["ACCEPTED", "REJECTED"]).notNull(),
  checkResultsJson: text("checkResultsJson").notNull(),
  reasonsJson: text("reasonsJson").notNull(),
  rejectionReason: text("rejectionReason"),
  planExpiresAt: timestamp("planExpiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("simulationTradeDecisions_user_request_unique").on(table.userId, table.requestKey),
  index("simulationTradeDecisions_user_created_idx").on(table.userId, table.createdAt),
]);

/** Pending limit/stop orders are paper records and are revalidated before a virtual fill. */
export const simulationPendingOrders = mysqlTable("simulationPendingOrders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  simulationPortfolioId: int("simulationPortfolioId").notNull(),
  decisionId: int("decisionId").notNull(),
  symbol: varchar("symbol", { length: 15 }).notNull(),
  side: mysqlEnum("side", ["buy", "sell"]).notNull(),
  orderType: mysqlEnum("orderType", ["limit", "stop"]).notNull(),
  quantity: decimal("quantity", { precision: 30, scale: 12 }).notNull(),
  triggerPriceUsd: decimal("triggerPriceUsd", { precision: 24, scale: 8 }).notNull(),
  stopPriceUsd: decimal("stopPriceUsd", { precision: 24, scale: 8 }).notNull(),
  targetPriceUsd: decimal("targetPriceUsd", { precision: 24, scale: 8 }).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "FILLED", "CANCELLED", "REJECTED"]).notNull().default("ACTIVE"),
  filledTransactionId: int("filledTransactionId"),
  cancelReason: text("cancelReason"),
  filledAt: timestamp("filledAt"),
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("simulationPendingOrders_decision_unique").on(table.decisionId),
  index("simulationPendingOrders_user_status_idx").on(table.userId, table.status),
]);

/** Idempotent safety and monitoring event history for the paper-trading system. */
export const simulationRiskEvents = mysqlTable("simulationRiskEvents", {
  id: int("id").autoincrement().primaryKey(),
  eventKey: varchar("eventKey", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  simulationPortfolioId: int("simulationPortfolioId"),
  positionId: int("positionId"),
  decisionId: int("decisionId"),
  pendingOrderId: int("pendingOrderId"),
  transactionId: int("transactionId"),
  symbol: varchar("symbol", { length: 15 }),
  eventType: mysqlEnum("eventType", ["EMERGENCY_STOP_ACTIVATED", "EMERGENCY_STOP_RESET", "COOLDOWN_STARTED", "COOLDOWN_ENDED", "PENDING_ORDER_CANCELLED", "PENDING_ORDER_FILLED", "STOP_OBSERVED", "TARGET_OBSERVED", "REGIME_CHANGED", "DATA_UNAVAILABLE", "MONITORING_FAILURE"]).notNull(),
  severity: mysqlEnum("severity", ["INFO", "WARNING", "CRITICAL"]).notNull(),
  observedPriceUsd: decimal("observedPriceUsd", { precision: 24, scale: 8 }),
  dataSource: varchar("dataSource", { length: 80 }),
  providerUpdatedAt: timestamp("providerUpdatedAt"),
  detailsJson: text("detailsJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("simulationRiskEvents_user_key_unique").on(table.userId, table.eventKey),
  index("simulationRiskEvents_user_created_idx").on(table.userId, table.createdAt),
]);

export const paperStrategies = mysqlTable("paperStrategies", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), name: varchar("name", { length: 100 }).notNull(), description: text("description"), symbol: varchar("symbol", { length: 15 }).notNull(), interval: mysqlEnum("interval", ["5m", "15m", "1h", "4h", "1d"]).notNull(), status: mysqlEnum("status", ["DRAFT", "ACTIVE", "ARCHIVED"]).notNull().default("DRAFT"), currentRevisionNumber: int("currentRevisionNumber").notNull().default(1), requiredEntitlement: varchar("requiredEntitlement", { length: 40 }).notNull().default("strategy_lab"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("paperStrategies_user_updated_idx").on(table.userId, table.updatedAt)]);

export const paperStrategyRevisions = mysqlTable("paperStrategyRevisions", {
  id: int("id").autoincrement().primaryKey(), strategyId: int("strategyId").notNull(), userId: int("userId").notNull(), revisionNumber: int("revisionNumber").notNull(), ruleConfigJson: text("ruleConfigJson").notNull(), riskConfigJson: text("riskConfigJson").notNull(), contentFingerprint: varchar("contentFingerprint", { length: 64 }).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("paperStrategyRevisions_strategy_revision_unique").on(table.strategyId, table.revisionNumber), index("paperStrategyRevisions_user_created_idx").on(table.userId, table.createdAt)]);

export const backtestDatasets = mysqlTable("backtestDatasets", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), symbol: varchar("symbol", { length: 15 }).notNull(), interval: mysqlEnum("interval", ["5m", "15m", "1h", "4h", "1d"]).notNull(), provider: varchar("provider", { length: 40 }).notNull(), rangeStart: timestamp("rangeStart").notNull(), rangeEnd: timestamp("rangeEnd").notNull(), candleCount: int("candleCount").notNull(), candleFingerprint: varchar("candleFingerprint", { length: 64 }).notNull(), schemaVersion: int("schemaVersion").notNull().default(1), fetchedAt: timestamp("fetchedAt").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("backtestDatasets_user_fingerprint_unique").on(table.userId, table.candleFingerprint), index("backtestDatasets_user_created_idx").on(table.userId, table.createdAt)]);

export const backtestDatasetCandles = mysqlTable("backtestDatasetCandles", {
  id: int("id").autoincrement().primaryKey(), datasetId: int("datasetId").notNull(), sequence: int("sequence").notNull(), openTime: timestamp("openTime").notNull(), closeTime: timestamp("closeTime").notNull(), open: decimal("open", { precision: 24, scale: 8 }).notNull(), high: decimal("high", { precision: 24, scale: 8 }).notNull(), low: decimal("low", { precision: 24, scale: 8 }).notNull(), close: decimal("close", { precision: 24, scale: 8 }).notNull(), volume: decimal("volume", { precision: 30, scale: 12 }).notNull(), quoteVolumeUsd: decimal("quoteVolumeUsd", { precision: 30, scale: 8 }).notNull(), tradeCount: int("tradeCount").notNull(),
}, (table) => [uniqueIndex("backtestDatasetCandles_dataset_sequence_unique").on(table.datasetId, table.sequence), uniqueIndex("backtestDatasetCandles_dataset_open_unique").on(table.datasetId, table.openTime)]);

export const strategyBacktestRuns = mysqlTable("strategyBacktestRuns", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), strategyId: int("strategyId").notNull(), strategyRevisionId: int("strategyRevisionId").notNull(), datasetId: int("datasetId").notNull(), engineVersion: varchar("engineVersion", { length: 32 }).notNull(), entitlementKey: varchar("entitlementKey", { length: 40 }).notNull(), status: mysqlEnum("status", ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "REJECTED"]).notNull().default("QUEUED"), initialEquityUsd: decimal("initialEquityUsd", { precision: 24, scale: 2 }).notNull(), feeBps: int("feeBps").notNull(), slippageBps: int("slippageBps").notNull(), runConfigJson: text("runConfigJson").notNull(), resultJson: text("resultJson"), runFingerprint: varchar("runFingerprint", { length: 64 }).notNull(), rejectionReason: text("rejectionReason"), startedAt: timestamp("startedAt"), completedAt: timestamp("completedAt"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("strategyBacktestRuns_user_fingerprint_unique").on(table.userId, table.runFingerprint), index("strategyBacktestRuns_user_created_idx").on(table.userId, table.createdAt), index("strategyBacktestRuns_strategy_created_idx").on(table.strategyId, table.createdAt)]);

export const strategyBacktestTrades = mysqlTable("strategyBacktestTrades", {
  id: int("id").autoincrement().primaryKey(), runId: int("runId").notNull(), sequence: int("sequence").notNull(), decision: mysqlEnum("decision", ["ACCEPTED", "REJECTED"]).notNull(), signalTime: timestamp("signalTime").notNull(), entryTime: timestamp("entryTime"), exitTime: timestamp("exitTime"), entryPriceUsd: decimal("entryPriceUsd", { precision: 24, scale: 8 }), exitPriceUsd: decimal("exitPriceUsd", { precision: 24, scale: 8 }), quantity: decimal("quantity", { precision: 30, scale: 12 }).notNull(), stopPriceUsd: decimal("stopPriceUsd", { precision: 24, scale: 8 }), targetPriceUsd: decimal("targetPriceUsd", { precision: 24, scale: 8 }), plannedRiskUsd: decimal("plannedRiskUsd", { precision: 24, scale: 2 }), plannedRiskPercent: decimal("plannedRiskPercent", { precision: 8, scale: 4 }), grossPnlUsd: decimal("grossPnlUsd", { precision: 24, scale: 2 }), netPnlUsd: decimal("netPnlUsd", { precision: 24, scale: 2 }), estimatedFeesUsd: decimal("estimatedFeesUsd", { precision: 24, scale: 2 }).notNull().default("0.00"), maxExposureUsd: decimal("maxExposureUsd", { precision: 24, scale: 2 }), exitReason: mysqlEnum("exitReason", ["STOP", "TARGET", "RULE_EXIT", "END_OF_DATA", "REJECTED"]), gateJson: text("gateJson").notNull(), evidenceJson: text("evidenceJson").notNull(), rejectionReason: text("rejectionReason"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("strategyBacktestTrades_run_sequence_unique").on(table.runId, table.sequence), index("strategyBacktestTrades_run_signal_idx").on(table.runId, table.signalTime)]);

export const strategyBacktestEquityPoints = mysqlTable("strategyBacktestEquityPoints", {
  id: int("id").autoincrement().primaryKey(), runId: int("runId").notNull(), sequence: int("sequence").notNull(), observedAt: timestamp("observedAt").notNull(), cashUsd: decimal("cashUsd", { precision: 24, scale: 2 }).notNull(), positionValueUsd: decimal("positionValueUsd", { precision: 24, scale: 2 }).notNull(), equityUsd: decimal("equityUsd", { precision: 24, scale: 2 }).notNull(), drawdownPercent: decimal("drawdownPercent", { precision: 8, scale: 4 }).notNull(), exposurePercent: decimal("exposurePercent", { precision: 8, scale: 4 }).notNull(),
}, (table) => [uniqueIndex("strategyBacktestEquityPoints_run_sequence_unique").on(table.runId, table.sequence)]);

export const strategyLabAuditEvents = mysqlTable("strategyLabAuditEvents", {
  id: int("id").autoincrement().primaryKey(), eventKey: varchar("eventKey", { length: 128 }).notNull(), userId: int("userId").notNull(), strategyId: int("strategyId"), strategyRevisionId: int("strategyRevisionId"), datasetId: int("datasetId"), runId: int("runId"), eventType: mysqlEnum("eventType", ["STRATEGY_CREATED", "STRATEGY_REVISED", "STRATEGY_ARCHIVED", "DATASET_CAPTURED", "BACKTEST_STARTED", "BACKTEST_COMPLETED", "BACKTEST_REJECTED", "BACKTEST_FAILED"]).notNull(), detailsJson: text("detailsJson").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("strategyLabAuditEvents_user_key_unique").on(table.userId, table.eventKey), index("strategyLabAuditEvents_user_created_idx").on(table.userId, table.createdAt)]);

export const userFeatureEntitlements = mysqlTable("userFeatureEntitlements", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), featureKey: varchar("featureKey", { length: 40 }).notNull(), tier: mysqlEnum("tier", ["FREE", "PRO", "ELITE"]).notNull().default("FREE"), enabled: int("enabled").notNull().default(1), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("userFeatureEntitlements_user_feature_unique").on(table.userId, table.featureKey)]);

export const backtestDatasetImports = mysqlTable("backtestDatasetImports", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), datasetId: int("datasetId"), fileName: varchar("fileName", { length: 255 }).notNull(), sourceLabel: varchar("sourceLabel", { length: 120 }).notNull(), sourceClassification: mysqlEnum("sourceClassification", ["USER_IMPORTED_UNVERIFIED"]).notNull().default("USER_IMPORTED_UNVERIFIED"), csvFingerprint: varchar("csvFingerprint", { length: 64 }).notNull(), validationStatus: mysqlEnum("validationStatus", ["VERIFIED", "REJECTED"]).notNull(), validationErrorsJson: text("validationErrorsJson").notNull(), rowCount: int("rowCount").notNull(), importedAt: timestamp("importedAt").defaultNow().notNull(), verifiedAt: timestamp("verifiedAt"),
}, (table) => [uniqueIndex("backtestDatasetImports_user_csv_unique").on(table.userId, table.csvFingerprint), index("backtestDatasetImports_user_created_idx").on(table.userId, table.importedAt)]);

export const backtestRunComparisons = mysqlTable("backtestRunComparisons", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), comparisonFingerprint: varchar("comparisonFingerprint", { length: 64 }).notNull(), runIdsJson: text("runIdsJson").notNull(), comparisonJson: text("comparisonJson").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("backtestRunComparisons_user_fingerprint_unique").on(table.userId, table.comparisonFingerprint), index("backtestRunComparisons_user_created_idx").on(table.userId, table.createdAt)]);

export const parameterSearches = mysqlTable("parameterSearches", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), strategyId: int("strategyId").notNull(), strategyRevisionId: int("strategyRevisionId").notNull(), datasetId: int("datasetId").notNull(), entitlementKey: varchar("entitlementKey", { length: 40 }).notNull(), engineVersion: varchar("engineVersion", { length: 32 }).notNull(), searchFingerprint: varchar("searchFingerprint", { length: 64 }).notNull(), status: mysqlEnum("status", ["QUEUED", "RUNNING", "COMPLETED", "REJECTED", "FAILED"]).notNull().default("QUEUED"), parameterPlanJson: text("parameterPlanJson").notNull(), periodPlanJson: text("periodPlanJson").notNull(), candidateCount: int("candidateCount").notNull(), rejectionReason: text("rejectionReason"), robustnessJson: text("robustnessJson"), startedAt: timestamp("startedAt"), completedAt: timestamp("completedAt"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("parameterSearches_user_fingerprint_unique").on(table.userId, table.searchFingerprint), index("parameterSearches_user_created_idx").on(table.userId, table.createdAt)]);

export const parameterSearchCandidates = mysqlTable("parameterSearchCandidates", {
  id: int("id").autoincrement().primaryKey(), searchId: int("searchId").notNull(), sequence: int("sequence").notNull(), candidateFingerprint: varchar("candidateFingerprint", { length: 64 }).notNull(), parameterJson: text("parameterJson").notNull(), status: mysqlEnum("status", ["COMPLETED", "REJECTED", "FAILED"]).notNull(), resultJson: text("resultJson"), rejectionReason: text("rejectionReason"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("parameterSearchCandidates_search_sequence_unique").on(table.searchId, table.sequence), uniqueIndex("parameterSearchCandidates_search_fingerprint_unique").on(table.searchId, table.candidateFingerprint)]);

export const parameterSearchPeriodResults = mysqlTable("parameterSearchPeriodResults", {
  id: int("id").autoincrement().primaryKey(), candidateId: int("candidateId").notNull(), period: mysqlEnum("period", ["TRAINING", "VALIDATION", "OUT_OF_SAMPLE"]).notNull(), rangeStart: timestamp("rangeStart").notNull(), rangeEnd: timestamp("rangeEnd").notNull(), candleCount: int("candleCount").notNull(), metricsJson: text("metricsJson").notNull(), warningJson: text("warningJson").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("parameterSearchPeriodResults_candidate_period_unique").on(table.candidateId, table.period)]);

/** Public Ed25519 keys that a user elects to trust for signed historical-data manifests. */
export const csvTrustedPublisherKeys = mysqlTable("csvTrustedPublisherKeys", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), displayName: varchar("displayName", { length: 120 }).notNull(), publicKeySpkiBase64: varchar("publicKeySpkiBase64", { length: 1024 }).notNull(), keyFingerprint: varchar("keyFingerprint", { length: 64 }).notNull(), status: mysqlEnum("status", ["ACTIVE", "REVOKED"]).notNull().default("ACTIVE"), expiresAt: timestamp("expiresAt"), revokedAt: timestamp("revokedAt"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("csvTrustedPublisherKeys_user_fingerprint_unique").on(table.userId, table.keyFingerprint), index("csvTrustedPublisherKeys_user_status_idx").on(table.userId, table.status)]);

/** Immutable authentication outcome for an imported CSV; failure evidence is retained without persisting file bytes. */
export const csvSourceAuthentications = mysqlTable("csvSourceAuthentications", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), importId: int("importId").notNull(), datasetId: int("datasetId"), publisherKeyId: int("publisherKeyId"), requiredKeyFingerprint: varchar("requiredKeyFingerprint", { length: 64 }), declaredCsvFingerprint: varchar("declaredCsvFingerprint", { length: 64 }), observedCsvFingerprint: varchar("observedCsvFingerprint", { length: 64 }).notNull(), manifestJson: text("manifestJson"), authenticationStatus: mysqlEnum("authenticationStatus", ["VERIFIED", "REJECTED", "UNSIGNED"]).notNull(), failureCode: varchar("failureCode", { length: 80 }), verifiedAt: timestamp("verifiedAt"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("csvSourceAuthentications_import_created_idx").on(table.importId, table.createdAt), index("csvSourceAuthentications_user_created_idx").on(table.userId, table.createdAt)]);

/** Minimal per-user chart viewport preference; it never persists market candles or prices. */
export const userChartViewPreferences = mysqlTable("userChartViewPreferences", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), assetSymbol: varchar("assetSymbol", { length: 15 }).notNull(), source: mysqlEnum("source", ["binance", "coinbase"]).notNull(), interval: mysqlEnum("interval", ["1m", "5m", "15m", "1h", "4h", "1d"]).notNull(), requestedStart: timestamp("requestedStart").notNull(), requestedEnd: timestamp("requestedEnd").notNull(), visibleCandles: int("visibleCandles").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("userChartViewPreferences_user_chart_unique").on(table.userId, table.assetSymbol, table.source, table.interval), index("userChartViewPreferences_user_updated_idx").on(table.userId, table.updatedAt)]);

/** Explicit user-scoped context for grounded Copilot and smart-alert filtering. It stores preferences, not credentials or provider data. */
export const userCopilotPreferences = mysqlTable("userCopilotPreferences", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), favoriteSymbolsJson: text("favoriteSymbolsJson").notNull(), preferredTimeframesJson: text("preferredTimeframesJson").notNull(), enabledAlertTypesJson: text("enabledAlertTypesJson").notNull(), riskTolerance: mysqlEnum("riskTolerance", ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).notNull().default("BALANCED"), minimumAlertSeverity: mysqlEnum("minimumAlertSeverity", ["INFO", "WATCH", "WARNING", "CRITICAL"]).notNull().default("WATCH"), alertCooldownMinutes: int("alertCooldownMinutes").notNull().default(60), dailyBriefingEnabled: int("dailyBriefingEnabled").notNull().default(0), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("userCopilotPreferences_user_unique").on(table.userId)]);

/** Explainable smart-alert history. Events are generated only from verified application evidence and never trigger an order. */
export const smartAlertEvents = mysqlTable("smartAlertEvents", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), alertKey: varchar("alertKey", { length: 160 }).notNull(), alertGroupKey: varchar("alertGroupKey", { length: 120 }), eventType: varchar("eventType", { length: 64 }).notNull(), severity: mysqlEnum("severity", ["INFO", "WATCH", "WARNING", "CRITICAL"]).notNull(), symbol: varchar("symbol", { length: 15 }), positionId: int("positionId"), decisionId: int("decisionId"), strategyId: int("strategyId"), title: varchar("title", { length: 200 }).notNull(), summary: text("summary").notNull(), whyItMatters: text("whyItMatters").notNull(), attentionContext: text("attentionContext").notNull(), currentValue: varchar("currentValue", { length: 120 }), previousValue: varchar("previousValue", { length: 120 }), dataQuality: varchar("dataQuality", { length: 20 }).notNull(), dataSource: varchar("dataSource", { length: 80 }), providerUpdatedAt: timestamp("providerUpdatedAt"), evidenceJson: text("evidenceJson").notNull(), observedAt: timestamp("observedAt").notNull(), cooldownUntil: timestamp("cooldownUntil").notNull(), isRead: int("isRead").notNull().default(0), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("smartAlertEvents_user_key_unique").on(table.userId, table.alertKey), index("smartAlertEvents_user_created_idx").on(table.userId, table.createdAt), index("smartAlertEvents_user_cooldown_idx").on(table.userId, table.cooldownUntil), index("smartAlertEvents_user_group_idx").on(table.userId, table.alertGroupKey)]);

/** Current deterministic monitoring state for an open or recently closed paper position. */
export const paperPositionMonitoringStates = mysqlTable("paperPositionMonitoringStates", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), simulationPortfolioId: int("simulationPortfolioId").notNull(), positionId: int("positionId").notNull(), symbol: varchar("symbol", { length: 15 }).notNull(), state: mysqlEnum("state", ["OPEN", "WATCH", "STOP_APPROACHING", "TARGET_APPROACHING", "RISK_INCREASED", "DATA_STALE", "PROTECTION_TRIGGERED", "CLOSED"]).notNull().default("OPEN"), previousState: mysqlEnum("previousState", ["OPEN", "WATCH", "STOP_APPROACHING", "TARGET_APPROACHING", "RISK_INCREASED", "DATA_STALE", "PROTECTION_TRIGGERED", "CLOSED"]), currentPriceUsd: decimal("currentPriceUsd", { precision: 24, scale: 8 }), previousPriceUsd: decimal("previousPriceUsd", { precision: 24, scale: 8 }), exposurePercent: decimal("exposurePercent", { precision: 8, scale: 4 }), riskLevel: mysqlEnum("riskLevel", ["LOW", "MODERATE", "HIGH", "EXTREME"]), marketRegime: varchar("marketRegime", { length: 40 }), dataQuality: varchar("dataQuality", { length: 20 }).notNull(), dataSource: varchar("dataSource", { length: 80 }), providerUpdatedAt: timestamp("providerUpdatedAt"), triggerReason: text("triggerReason").notNull(), evidenceJson: text("evidenceJson").notNull(), observedAt: timestamp("observedAt").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("paperPositionMonitoringStates_user_position_unique").on(table.userId, table.positionId), index("paperPositionMonitoringStates_user_state_idx").on(table.userId, table.state), index("paperPositionMonitoringStates_portfolio_updated_idx").on(table.simulationPortfolioId, table.updatedAt)]);

/** Immutable paper-position state transition and monitoring audit evidence. */
export const paperPositionMonitoringEvents = mysqlTable("paperPositionMonitoringEvents", {
  id: int("id").autoincrement().primaryKey(), eventKey: varchar("eventKey", { length: 160 }).notNull(), userId: int("userId").notNull(), simulationPortfolioId: int("simulationPortfolioId").notNull(), positionId: int("positionId").notNull(), symbol: varchar("symbol", { length: 15 }).notNull(), previousState: mysqlEnum("previousState", ["OPEN", "WATCH", "STOP_APPROACHING", "TARGET_APPROACHING", "RISK_INCREASED", "DATA_STALE", "PROTECTION_TRIGGERED", "CLOSED"]), nextState: mysqlEnum("nextState", ["OPEN", "WATCH", "STOP_APPROACHING", "TARGET_APPROACHING", "RISK_INCREASED", "DATA_STALE", "PROTECTION_TRIGGERED", "CLOSED"]).notNull(), severity: mysqlEnum("severity", ["INFO", "WATCH", "WARNING", "CRITICAL"]).notNull(), currentValue: varchar("currentValue", { length: 120 }), previousValue: varchar("previousValue", { length: 120 }), riskLevel: mysqlEnum("riskLevel", ["LOW", "MODERATE", "HIGH", "EXTREME"]), marketRegime: varchar("marketRegime", { length: 40 }), dataQuality: varchar("dataQuality", { length: 20 }).notNull(), dataSource: varchar("dataSource", { length: 80 }), providerUpdatedAt: timestamp("providerUpdatedAt"), triggerReason: text("triggerReason").notNull(), evidenceJson: text("evidenceJson").notNull(), observedAt: timestamp("observedAt").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("paperPositionMonitoringEvents_user_key_unique").on(table.userId, table.eventKey), index("paperPositionMonitoringEvents_user_created_idx").on(table.userId, table.createdAt), index("paperPositionMonitoringEvents_position_created_idx").on(table.positionId, table.createdAt)]);

/** Explicit channel consent. Delivery providers remain inactive until separately configured by the user. */
export const userNotificationPreferences = mysqlTable("userNotificationPreferences", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), inAppConsent: int("inAppConsent").notNull().default(0), emailConsent: int("emailConsent").notNull().default(0), pushConsent: int("pushConsent").notNull().default(0), emailProviderStatus: mysqlEnum("emailProviderStatus", ["UNCONFIGURED", "READY"]).notNull().default("UNCONFIGURED"), pushProviderStatus: mysqlEnum("pushProviderStatus", ["UNCONFIGURED", "READY"]).notNull().default("UNCONFIGURED"), dailyBriefingScheduleIntent: int("dailyBriefingScheduleIntent").notNull().default(0), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("userNotificationPreferences_user_unique").on(table.userId)]);

/** Push-device readiness record. It stores lifecycle metadata, never a raw push token until a configured provider exists. */
export const notificationDeviceRegistrations = mysqlTable("notificationDeviceRegistrations", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), devicePublicId: varchar("devicePublicId", { length: 80 }).notNull(), platform: mysqlEnum("platform", ["WEB", "IOS", "ANDROID", "UNKNOWN"]).notNull().default("UNKNOWN"), permissionState: mysqlEnum("permissionState", ["DEFAULT", "GRANTED", "DENIED", "UNSUPPORTED", "REVOKED"]).notNull().default("DEFAULT"), tokenLifecycleState: mysqlEnum("tokenLifecycleState", ["NOT_REQUESTED", "PROVIDER_UNCONFIGURED", "REGISTERED", "REVOKED", "EXPIRED"]).notNull().default("NOT_REQUESTED"), tokenFingerprint: varchar("tokenFingerprint", { length: 64 }), consentedAt: timestamp("consentedAt"), revokedAt: timestamp("revokedAt"), lastSeenAt: timestamp("lastSeenAt"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("notificationDeviceRegistrations_user_device_unique").on(table.userId, table.devicePublicId), index("notificationDeviceRegistrations_user_status_idx").on(table.userId, table.permissionState)]);

/** Immutable prompt-to-evidence lineage for a Copilot answer. Evidence remains inspectable whether an LLM response or deterministic fallback was returned. */
export const copilotEvidenceRecords = mysqlTable("copilotEvidenceRecords", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), requestHash: varchar("requestHash", { length: 64 }).notNull(), requestKind: mysqlEnum("requestKind", ["MARKET", "SETUP", "RISK", "PAPER_TRADE", "PORTFOLIO", "BACKTEST", "BRIEFING"]).notNull(), question: text("question").notNull(), evidenceFingerprint: varchar("evidenceFingerprint", { length: 64 }).notNull(), evidenceJson: text("evidenceJson").notNull(), responseText: text("responseText").notNull(), responseMode: mysqlEnum("responseMode", ["AI_GROUNDED", "DETERMINISTIC_FALLBACK", "UNAVAILABLE"]).notNull(), modelId: varchar("modelId", { length: 80 }), generatedAt: timestamp("generatedAt").notNull(), expiresAt: timestamp("expiresAt").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("copilotEvidenceRecords_user_request_idx").on(table.userId, table.requestHash), index("copilotEvidenceRecords_user_generated_idx").on(table.userId, table.generatedAt)]);

/** On-demand daily evidence briefings; no background process or automatic notification is implied by this record. */
export const copilotDailyBriefings = mysqlTable("copilotDailyBriefings", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), briefingDateUtc: varchar("briefingDateUtc", { length: 10 }).notNull(), evidenceFingerprint: varchar("evidenceFingerprint", { length: 64 }).notNull(), evidenceJson: text("evidenceJson").notNull(), briefingText: text("briefingText").notNull(), responseMode: mysqlEnum("responseMode", ["AI_GROUNDED", "DETERMINISTIC_FALLBACK", "UNAVAILABLE"]).notNull(), modelId: varchar("modelId", { length: 80 }), generatedAt: timestamp("generatedAt").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("copilotDailyBriefings_user_date_unique").on(table.userId, table.briefingDateUtc), index("copilotDailyBriefings_user_generated_idx").on(table.userId, table.generatedAt)]);

/** Project-owned managed Heartbeat registration and the latest verified health observation. */
export const nexusMonitoringSchedules = mysqlTable("nexusMonitoringSchedules", {
  id: int("id").autoincrement().primaryKey(), scheduleKey: varchar("scheduleKey", { length: 64 }).notNull(), scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }), enabled: int("enabled").notNull().default(0), engineStatus: mysqlEnum("engineStatus", ["UNCONFIGURED", "OPERATIONAL", "DEGRADED", "FAILED"]).notNull().default("UNCONFIGURED"), lastCheckedAt: timestamp("lastCheckedAt"), lastEventAt: timestamp("lastEventAt"), dataFreshnessState: mysqlEnum("dataFreshnessState", ["FRESH", "STALE", "UNAVAILABLE", "UNKNOWN"]).notNull().default("UNKNOWN"), lastError: text("lastError"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("nexusMonitoringSchedules_key_unique").on(table.scheduleKey), index("nexusMonitoringSchedules_task_uid_idx").on(table.scheduleCronTaskUid)]);

/** Append-only timeline facts. Every automated explanation must reference these records or other immutable evidence. */
export const nexusActivityEvents = mysqlTable("nexusActivityEvents", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId"), source: mysqlEnum("source", ["MONITORING", "RISK_ENGINE", "SMART_ALERTS", "SHIELD", "COPILOT", "APPROVAL", "HEARTBEAT", "USER"]).notNull(), eventType: varchar("eventType", { length: 100 }).notNull(), severity: mysqlEnum("severity", ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).notNull().default("INFO"), stateBeforeJson: text("stateBeforeJson"), stateAfterJson: text("stateAfterJson"), evidenceJson: text("evidenceJson").notNull(), relatedAlertId: int("relatedAlertId"), relatedApprovalId: int("relatedApprovalId"), correlationKey: varchar("correlationKey", { length: 160 }), occurredAt: timestamp("occurredAt").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("nexusActivityEvents_user_occurred_idx").on(table.userId, table.occurredAt), index("nexusActivityEvents_correlation_idx").on(table.correlationKey, table.occurredAt), index("nexusActivityEvents_source_type_idx").on(table.source, table.eventType)]);

/** Rule-derived Shield output. Never store an ungrounded risk claim. */
export const nexusShieldFindings = mysqlTable("nexusShieldFindings", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId"), ruleCode: varchar("ruleCode", { length: 64 }).notNull(), riskLevel: mysqlEnum("riskLevel", ["SAFE", "REVIEW_REQUIRED", "HIGH_RISK", "BLOCKED"]).notNull(), reason: text("reason").notNull(), evidenceJson: text("evidenceJson").notNull(), recommendedAction: varchar("recommendedAction", { length: 180 }).notNull(), status: mysqlEnum("status", ["OPEN", "SUPPRESSED", "RESOLVED"]).notNull().default("OPEN"), relatedActivityEventId: int("relatedActivityEventId"), createdAt: timestamp("createdAt").defaultNow().notNull(), resolvedAt: timestamp("resolvedAt"),
}, (table) => [index("nexusShieldFindings_user_status_idx").on(table.userId, table.status, table.createdAt), index("nexusShieldFindings_rule_idx").on(table.ruleCode, table.createdAt)]);

/** User-scoped strict mode; mode changes require an immutable activity event. */
export const nexusSecurityModes = mysqlTable("nexusSecurityModes", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), enabled: int("enabled").notNull().default(0), activatedBy: mysqlEnum("activatedBy", ["USER", "RULE"]).notNull().default("USER"), reason: text("reason").notNull(), activatedAt: timestamp("activatedAt").notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("nexusSecurityModes_user_unique").on(table.userId)]);

/** Correlated high-severity evidence is collected in a case only when stored events justify it. */
export const nexusIncidents = mysqlTable("nexusIncidents", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId"), incidentKey: varchar("incidentKey", { length: 100 }).notNull(), severity: mysqlEnum("severity", ["MEDIUM", "HIGH", "CRITICAL"]).notNull(), state: mysqlEnum("state", ["OPEN", "INVESTIGATING", "MITIGATED", "RESOLVED", "FALSE_POSITIVE"]).notNull().default("OPEN"), summary: text("summary").notNull(), evidenceJson: text("evidenceJson").notNull(), firstDetectedAt: timestamp("firstDetectedAt").notNull(), lastUpdatedAt: timestamp("lastUpdatedAt").notNull(), resolution: text("resolution"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("nexusIncidents_user_key_unique").on(table.userId, table.incidentKey), index("nexusIncidents_user_state_idx").on(table.userId, table.state, table.lastUpdatedAt)]);

export const nexusIncidentEventLinks = mysqlTable("nexusIncidentEventLinks", {
  id: int("id").autoincrement().primaryKey(), incidentId: int("incidentId").notNull(), activityEventId: int("activityEventId").notNull(), linkedAt: timestamp("linkedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("nexusIncidentEventLinks_unique").on(table.incidentId, table.activityEventId), index("nexusIncidentEventLinks_event_idx").on(table.activityEventId)]);

/** Action Preview is a non-executing approval record; it cannot bypass the Risk Engine. */
export const nexusActionApprovals = mysqlTable("nexusActionApprovals", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), actionType: varchar("actionType", { length: 100 }).notNull(), requestedBy: mysqlEnum("requestedBy", ["USER", "SYSTEM"]).notNull(), previewStatus: mysqlEnum("previewStatus", ["SAFE", "REVIEW_REQUIRED", "HIGH_RISK", "BLOCKED"]).notNull(), whatText: text("whatText").notNull(), whyText: text("whyText").notNull(), impactText: text("impactText").notNull(), evidenceJson: text("evidenceJson").notNull(), requiredPermissionsJson: text("requiredPermissionsJson").notNull(), state: mysqlEnum("state", ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED", "ESCALATED"]).notNull().default("PENDING"), expiresAt: timestamp("expiresAt"), resolvedAt: timestamp("resolvedAt"), resolutionReason: text("resolutionReason"), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("nexusActionApprovals_user_state_idx").on(table.userId, table.state, table.createdAt), index("nexusActionApprovals_user_action_idx").on(table.userId, table.actionType)]);

/** Nexus V3.0 subscription state is server-owned and never sourced from a client plan flag. */
export const userSubscriptions = mysqlTable("userSubscriptions", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), plan: mysqlEnum("plan", ["FREE", "PRO", "ELITE"]).notNull().default("FREE"), state: mysqlEnum("state", ["FREE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"]).notNull().default("FREE"), provider: varchar("provider", { length: 40 }), providerSubscriptionId: varchar("providerSubscriptionId", { length: 160 }), trialStartedAt: timestamp("trialStartedAt"), trialEndsAt: timestamp("trialEndsAt"), currentPeriodEndsAt: timestamp("currentPeriodEndsAt"), canceledAt: timestamp("canceledAt"), expiresAt: timestamp("expiresAt"), stateReason: varchar("stateReason", { length: 180 }).notNull().default("INITIAL_FREE"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("userSubscriptions_user_unique").on(table.userId), uniqueIndex("userSubscriptions_provider_subscription_unique").on(table.provider, table.providerSubscriptionId), index("userSubscriptions_state_idx").on(table.state, table.currentPeriodEndsAt)]);

export const entitlementDecisions = mysqlTable("entitlementDecisions", {
  id: int("id").autoincrement().primaryKey(), decisionKey: varchar("decisionKey", { length: 128 }).notNull(), userId: int("userId").notNull(), featureKey: varchar("featureKey", { length: 64 }).notNull(), requestedPlan: varchar("requestedPlan", { length: 16 }).notNull(), effectivePlan: varchar("effectivePlan", { length: 16 }).notNull(), subscriptionState: varchar("subscriptionState", { length: 16 }).notNull(), allowed: int("allowed").notNull(), reasonCode: varchar("reasonCode", { length: 80 }).notNull(), limitValue: int("limitValue"), usageValue: int("usageValue"), evidenceJson: text("evidenceJson").notNull(), decidedAt: timestamp("decidedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("entitlementDecisions_key_unique").on(table.decisionKey), index("entitlementDecisions_user_feature_idx").on(table.userId, table.featureKey, table.decidedAt)]);

export const entitlementUsagePeriods = mysqlTable("entitlementUsagePeriods", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), metric: varchar("metric", { length: 64 }).notNull(), periodStart: timestamp("periodStart").notNull(), periodEnd: timestamp("periodEnd").notNull(), usedCount: int("usedCount").notNull().default(0), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("entitlementUsagePeriods_user_metric_period_unique").on(table.userId, table.metric, table.periodStart), index("entitlementUsagePeriods_user_period_idx").on(table.userId, table.periodEnd)]);

/** Future payment customer reference; no payment instrument fields are stored. */
export const billingProviderCustomers = mysqlTable("billingProviderCustomers", {
  id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull(), provider: varchar("provider", { length: 40 }).notNull(), providerCustomerId: varchar("providerCustomerId", { length: 160 }).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("billingProviderCustomers_user_provider_unique").on(table.userId, table.provider), uniqueIndex("billingProviderCustomers_provider_customer_unique").on(table.provider, table.providerCustomerId)]);

/** Idempotency inbox for future authenticated payment-provider webhooks. */
export const paymentWebhookDeliveries = mysqlTable("paymentWebhookDeliveries", {
  id: int("id").autoincrement().primaryKey(), provider: varchar("provider", { length: 40 }).notNull(), providerEventId: varchar("providerEventId", { length: 160 }).notNull(), eventType: varchar("eventType", { length: 100 }).notNull(), verificationState: mysqlEnum("verificationState", ["RECEIVED", "VERIFIED", "REJECTED"]).notNull().default("RECEIVED"), processingState: mysqlEnum("processingState", ["PENDING", "PROCESSED", "IGNORED", "FAILED"]).notNull().default("PENDING"), payloadHash: varchar("payloadHash", { length: 64 }).notNull(), payloadJson: text("payloadJson"), errorMessage: text("errorMessage"), processedAt: timestamp("processedAt"), receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("paymentWebhookDeliveries_provider_event_unique").on(table.provider, table.providerEventId), index("paymentWebhookDeliveries_state_idx").on(table.processingState, table.receivedAt)]);

export const billingAuditEvents = mysqlTable("billingAuditEvents", {
  id: int("id").autoincrement().primaryKey(), eventKey: varchar("eventKey", { length: 128 }).notNull(), userId: int("userId"), source: mysqlEnum("source", ["SYSTEM", "USER", "ADMIN", "PROVIDER"]).notNull(), eventType: varchar("eventType", { length: 100 }).notNull(), detailsJson: text("detailsJson").notNull(), occurredAt: timestamp("occurredAt").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("billingAuditEvents_key_unique").on(table.eventKey), index("billingAuditEvents_user_occurred_idx").on(table.userId, table.occurredAt)]);

export type SimulationPortfolio = typeof simulationPortfolios.$inferSelect;
export type SimulationPosition = typeof simulationPositions.$inferSelect;
export type SimulationTransaction = typeof simulationTransactions.$inferSelect;
export type SimulationRiskSettings = typeof simulationRiskSettings.$inferSelect;
export type InsertSimulationRiskSettings = typeof simulationRiskSettings.$inferInsert;
export type SimulationSafetyState = typeof simulationSafetyStates.$inferSelect;
export type SimulationTradeDecision = typeof simulationTradeDecisions.$inferSelect;
export type SimulationPendingOrder = typeof simulationPendingOrders.$inferSelect;
export type SimulationRiskEvent = typeof simulationRiskEvents.$inferSelect;
export type PaperStrategy = typeof paperStrategies.$inferSelect;
export type PaperStrategyRevision = typeof paperStrategyRevisions.$inferSelect;
export type BacktestDataset = typeof backtestDatasets.$inferSelect;
export type BacktestDatasetCandle = typeof backtestDatasetCandles.$inferSelect;
export type StrategyBacktestRun = typeof strategyBacktestRuns.$inferSelect;
export type StrategyBacktestTrade = typeof strategyBacktestTrades.$inferSelect;
export type StrategyBacktestEquityPoint = typeof strategyBacktestEquityPoints.$inferSelect;
export type StrategyLabAuditEvent = typeof strategyLabAuditEvents.$inferSelect;
export type UserFeatureEntitlement = typeof userFeatureEntitlements.$inferSelect;
export type BacktestDatasetImport = typeof backtestDatasetImports.$inferSelect;
export type BacktestRunComparison = typeof backtestRunComparisons.$inferSelect;
export type ParameterSearch = typeof parameterSearches.$inferSelect;
export type ParameterSearchCandidate = typeof parameterSearchCandidates.$inferSelect;
export type CsvTrustedPublisherKey = typeof csvTrustedPublisherKeys.$inferSelect;
export type CsvSourceAuthentication = typeof csvSourceAuthentications.$inferSelect;
export type ParameterSearchPeriodResult = typeof parameterSearchPeriodResults.$inferSelect;
export type UserChartViewPreference = typeof userChartViewPreferences.$inferSelect;
export type UserCopilotPreference = typeof userCopilotPreferences.$inferSelect;
export type PaperPositionMonitoringState = typeof paperPositionMonitoringStates.$inferSelect;
export type PaperPositionMonitoringEvent = typeof paperPositionMonitoringEvents.$inferSelect;
export type UserNotificationPreference = typeof userNotificationPreferences.$inferSelect;
export type NotificationDeviceRegistration = typeof notificationDeviceRegistrations.$inferSelect;
export type SmartAlertEvent = typeof smartAlertEvents.$inferSelect;
export type CopilotEvidenceRecord = typeof copilotEvidenceRecords.$inferSelect;
export type CopilotDailyBriefing = typeof copilotDailyBriefings.$inferSelect;
export type NexusMonitoringSchedule = typeof nexusMonitoringSchedules.$inferSelect;
export type NexusActivityEvent = typeof nexusActivityEvents.$inferSelect;
export type NexusShieldFinding = typeof nexusShieldFindings.$inferSelect;
export type NexusSecurityMode = typeof nexusSecurityModes.$inferSelect;
export type NexusIncident = typeof nexusIncidents.$inferSelect;
export type NexusActionApproval = typeof nexusActionApprovals.$inferSelect;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type EntitlementDecision = typeof entitlementDecisions.$inferSelect;
export type EntitlementUsagePeriod = typeof entitlementUsagePeriods.$inferSelect;
export type BillingProviderCustomer = typeof billingProviderCustomers.$inferSelect;
export type PaymentWebhookDelivery = typeof paymentWebhookDeliveries.$inferSelect;
export type BillingAuditEvent = typeof billingAuditEvents.$inferSelect;

// Exchange integrations (for multi-platform support)
export const exchangeApiKeys = mysqlTable("exchangeApiKeys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  exchange: mysqlEnum("exchange", ["binance", "coinbase", "okx", "kraken", "bybit"]).notNull(),
  apiKey: text("apiKey").notNull(), // Encrypted
  apiSecret: text("apiSecret").notNull(), // Encrypted
  passphrase: text("passphrase"), // For OKX and some others
  label: varchar("label", { length: 100 }),
  isActive: int("isActive").default(1).notNull(),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExchangeApiKey = typeof exchangeApiKeys.$inferSelect;
export type InsertExchangeApiKey = typeof exchangeApiKeys.$inferInsert;

// Price alert rules
export const priceAlerts = mysqlTable("priceAlerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  cryptoId: int("cryptoId").notNull().references(() => cryptocurrencies.id),
  alertType: mysqlEnum("alertType", ["above", "below", "change_percent"]).notNull(),
  targetPrice: varchar("targetPrice", { length: 30 }),
  changePercent: varchar("changePercent", { length: 10 }),
  isActive: int("isActive").default(1).notNull(),
  hasTriggered: int("hasTriggered").default(0).notNull(),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = typeof priceAlerts.$inferInsert;

/** Public addresses only. This table never accepts seed phrases, private keys, signing material, or provider secrets. */
export const onChainWallets = mysqlTable("onChainWallets", {
  id: int("id").autoincrement().primaryKey(),
  chain: mysqlEnum("chain", ["ethereum", "base"]).notNull(),
  address: varchar("address", { length: 64 }).notNull(),
  normalizedAddress: varchar("normalizedAddress", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull().default("alchemy"),
  dataQuality: mysqlEnum("dataQuality", ["VERIFIED", "PARTIAL", "STALE", "UNAVAILABLE"]).notNull().default("UNAVAILABLE"),
  providerStatus: varchar("providerStatus", { length: 32 }).notNull().default("NOT_CONFIGURED"),
  lastSuccessfulSyncAt: timestamp("lastSuccessfulSyncAt"),
  lastRequestedAt: timestamp("lastRequestedAt"),
  lastErrorCode: varchar("lastErrorCode", { length: 80 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("onChainWallets_chain_address_unique").on(table.chain, table.normalizedAddress), index("onChainWallets_provider_status_idx").on(table.provider, table.providerStatus)]);

/** User-owned labels, tags, and alert preferences attached to a public on-chain wallet reference. */
export const userOnChainWalletWatchlists = mysqlTable("userOnChainWalletWatchlists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  walletId: int("walletId").notNull().references(() => onChainWallets.id),
  label: varchar("label", { length: 120 }),
  tagsJson: text("tagsJson").notNull(),
  alertPreferencesJson: text("alertPreferencesJson").notNull(),
  isActive: int("isActive").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("userOnChainWalletWatchlists_user_wallet_unique").on(table.userId, table.walletId), index("userOnChainWalletWatchlists_user_active_idx").on(table.userId, table.isActive)]);

/** Provider-normalized observed transaction and transfer rows. transferKey makes provider pagination idempotent. */
export const onChainTransactions = mysqlTable("onChainTransactions", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull().references(() => onChainWallets.id),
  provider: varchar("provider", { length: 40 }).notNull(),
  transferKey: varchar("transferKey", { length: 180 }).notNull(),
  transactionHash: varchar("transactionHash", { length: 100 }).notNull(),
  blockNumber: varchar("blockNumber", { length: 40 }),
  observedAt: timestamp("observedAt"),
  fromAddress: varchar("fromAddress", { length: 64 }),
  toAddress: varchar("toAddress", { length: 64 }),
  category: varchar("category", { length: 40 }).notNull(),
  asset: varchar("asset", { length: 80 }),
  contractAddress: varchar("contractAddress", { length: 64 }),
  value: varchar("value", { length: 120 }),
  sourcePayloadJson: text("sourcePayloadJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("onChainTransactions_wallet_transfer_unique").on(table.walletId, table.transferKey), index("onChainTransactions_wallet_observed_idx").on(table.walletId, table.observedAt), index("onChainTransactions_hash_idx").on(table.transactionHash)]);

/** Current observed token balance state; valuations are intentionally absent until a source-backed pricing contract is available. */
export const onChainTokenBalances = mysqlTable("onChainTokenBalances", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull().references(() => onChainWallets.id),
  provider: varchar("provider", { length: 40 }).notNull(),
  contractAddress: varchar("contractAddress", { length: 64 }).notNull(),
  tokenBalance: varchar("tokenBalance", { length: 120 }).notNull(),
  decimals: int("decimals"),
  symbol: varchar("symbol", { length: 80 }),
  tokenName: varchar("tokenName", { length: 200 }),
  observedAt: timestamp("observedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("onChainTokenBalances_wallet_contract_unique").on(table.walletId, table.contractAddress), index("onChainTokenBalances_wallet_observed_idx").on(table.walletId, table.observedAt)]);

/** Append-only native-balance observations for historical activity and freshness, never interpolated. */
export const onChainBalanceSnapshots = mysqlTable("onChainBalanceSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull().references(() => onChainWallets.id),
  provider: varchar("provider", { length: 40 }).notNull(),
  nativeBalanceWei: varchar("nativeBalanceWei", { length: 120 }).notNull(),
  observedAt: timestamp("observedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("onChainBalanceSnapshots_wallet_observed_unique").on(table.walletId, table.observedAt), index("onChainBalanceSnapshots_wallet_created_idx").on(table.walletId, table.createdAt)]);

/** Sync receipts retain timing and error state without storing a provider credential or an unbounded provider response. */
export const onChainProviderSyncs = mysqlTable("onChainProviderSyncs", {
  id: int("id").autoincrement().primaryKey(),
  syncKey: varchar("syncKey", { length: 128 }).notNull(),
  walletId: int("walletId").notNull().references(() => onChainWallets.id),
  provider: varchar("provider", { length: 40 }).notNull(),
  status: mysqlEnum("status", ["SUCCEEDED", "PARTIAL", "RATE_LIMITED", "FAILED", "NOT_CONFIGURED"]).notNull(),
  latencyMs: int("latencyMs"),
  requestCount: int("requestCount").notNull().default(0),
  errorCode: varchar("errorCode", { length: 80 }),
  nextPageKey: varchar("nextPageKey", { length: 512 }),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("onChainProviderSyncs_key_unique").on(table.syncKey), index("onChainProviderSyncs_wallet_synced_idx").on(table.walletId, table.syncedAt), index("onChainProviderSyncs_provider_status_idx").on(table.provider, table.status)]);

/** Idempotent inbox for verified on-chain provider webhooks. Raw event bodies are hashed, and only normalized affected public addresses are retained. */
export const onChainWebhookDeliveries = mysqlTable("onChainWebhookDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  providerEventId: varchar("providerEventId", { length: 180 }).notNull(),
  eventType: varchar("eventType", { length: 120 }).notNull(),
  verificationState: mysqlEnum("verificationState", ["VERIFIED", "REJECTED", "NOT_CONFIGURED"]).notNull(),
  processingState: mysqlEnum("processingState", ["RECEIVED", "PROCESSED", "IGNORED", "FAILED"]).notNull().default("RECEIVED"),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  affectedAddressesJson: text("affectedAddressesJson").notNull(),
  errorCode: varchar("errorCode", { length: 100 }),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
}, (table) => [uniqueIndex("onChainWebhookDeliveries_provider_event_unique").on(table.provider, table.providerEventId), index("onChainWebhookDeliveries_state_idx").on(table.processingState, table.receivedAt)]);

/** Explainable proprietary Nexus analytics. Scores remain null until minimum source-backed evidence is available. */
export const onChainWalletScores = mysqlTable("onChainWalletScores", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull().references(() => onChainWallets.id),
  smartMoneyScore: decimal("smartMoneyScore", { precision: 7, scale: 2 }),
  confidenceScore: decimal("confidenceScore", { precision: 7, scale: 2 }),
  classification: mysqlEnum("classification", ["ELITE", "STRONG", "PROMISING", "NEUTRAL", "WEAK", "INSUFFICIENT_DATA"]).notNull().default("INSUFFICIENT_DATA"),
  scoreComponentsJson: text("scoreComponentsJson").notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  dataQuality: mysqlEnum("dataQuality", ["VERIFIED", "PARTIAL", "STALE", "UNAVAILABLE"]).notNull(),
  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("onChainWalletScores_wallet_calculated_unique").on(table.walletId, table.calculatedAt), index("onChainWalletScores_classification_idx").on(table.classification)]);

export type OnChainWallet = typeof onChainWallets.$inferSelect;
export type UserOnChainWalletWatchlist = typeof userOnChainWalletWatchlists.$inferSelect;
export type OnChainTransaction = typeof onChainTransactions.$inferSelect;
export type OnChainTokenBalance = typeof onChainTokenBalances.$inferSelect;
export type OnChainBalanceSnapshot = typeof onChainBalanceSnapshots.$inferSelect;
export type OnChainProviderSync = typeof onChainProviderSyncs.$inferSelect;
export type OnChainWebhookDelivery = typeof onChainWebhookDeliveries.$inferSelect;
export type OnChainWalletScore = typeof onChainWalletScores.$inferSelect;
