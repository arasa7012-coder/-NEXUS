CREATE TABLE `backtestDatasetCandles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`datasetId` int NOT NULL,
	`sequence` int NOT NULL,
	`openTime` timestamp NOT NULL,
	`closeTime` timestamp NOT NULL,
	`open` decimal(24,8) NOT NULL,
	`high` decimal(24,8) NOT NULL,
	`low` decimal(24,8) NOT NULL,
	`close` decimal(24,8) NOT NULL,
	`volume` decimal(30,12) NOT NULL,
	`quoteVolumeUsd` decimal(30,8) NOT NULL,
	`tradeCount` int NOT NULL,
	CONSTRAINT `backtestDatasetCandles_id` PRIMARY KEY(`id`),
	CONSTRAINT `backtestDatasetCandles_dataset_sequence_unique` UNIQUE(`datasetId`,`sequence`),
	CONSTRAINT `backtestDatasetCandles_dataset_open_unique` UNIQUE(`datasetId`,`openTime`)
);
--> statement-breakpoint
CREATE TABLE `backtestDatasets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(15) NOT NULL,
	`interval` enum('5m','15m','1h','4h','1d') NOT NULL,
	`provider` varchar(40) NOT NULL,
	`rangeStart` timestamp NOT NULL,
	`rangeEnd` timestamp NOT NULL,
	`candleCount` int NOT NULL,
	`candleFingerprint` varchar(64) NOT NULL,
	`schemaVersion` int NOT NULL DEFAULT 1,
	`fetchedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backtestDatasets_id` PRIMARY KEY(`id`),
	CONSTRAINT `backtestDatasets_user_fingerprint_unique` UNIQUE(`userId`,`candleFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `paperStrategies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`symbol` varchar(15) NOT NULL,
	`interval` enum('5m','15m','1h','4h','1d') NOT NULL,
	`status` enum('DRAFT','ACTIVE','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`currentRevisionNumber` int NOT NULL DEFAULT 1,
	`requiredEntitlement` varchar(40) NOT NULL DEFAULT 'strategy_lab',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paperStrategies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paperStrategyRevisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`strategyId` int NOT NULL,
	`userId` int NOT NULL,
	`revisionNumber` int NOT NULL,
	`ruleConfigJson` text NOT NULL,
	`riskConfigJson` text NOT NULL,
	`contentFingerprint` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paperStrategyRevisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `paperStrategyRevisions_strategy_revision_unique` UNIQUE(`strategyId`,`revisionNumber`)
);
--> statement-breakpoint
CREATE TABLE `strategyBacktestEquityPoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`sequence` int NOT NULL,
	`observedAt` timestamp NOT NULL,
	`cashUsd` decimal(24,2) NOT NULL,
	`positionValueUsd` decimal(24,2) NOT NULL,
	`equityUsd` decimal(24,2) NOT NULL,
	`drawdownPercent` decimal(8,4) NOT NULL,
	`exposurePercent` decimal(8,4) NOT NULL,
	CONSTRAINT `strategyBacktestEquityPoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `strategyBacktestEquityPoints_run_sequence_unique` UNIQUE(`runId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `strategyBacktestRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`strategyId` int NOT NULL,
	`strategyRevisionId` int NOT NULL,
	`datasetId` int NOT NULL,
	`engineVersion` varchar(32) NOT NULL,
	`entitlementKey` varchar(40) NOT NULL,
	`status` enum('QUEUED','RUNNING','COMPLETED','FAILED','REJECTED') NOT NULL DEFAULT 'QUEUED',
	`initialEquityUsd` decimal(24,2) NOT NULL,
	`feeBps` int NOT NULL,
	`slippageBps` int NOT NULL,
	`runConfigJson` text NOT NULL,
	`resultJson` text,
	`runFingerprint` varchar(64) NOT NULL,
	`rejectionReason` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strategyBacktestRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `strategyBacktestRuns_user_fingerprint_unique` UNIQUE(`userId`,`runFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `strategyBacktestTrades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`sequence` int NOT NULL,
	`decision` enum('ACCEPTED','REJECTED') NOT NULL,
	`signalTime` timestamp NOT NULL,
	`entryTime` timestamp,
	`exitTime` timestamp,
	`entryPriceUsd` decimal(24,8),
	`exitPriceUsd` decimal(24,8),
	`quantity` decimal(30,12) NOT NULL,
	`stopPriceUsd` decimal(24,8),
	`targetPriceUsd` decimal(24,8),
	`plannedRiskUsd` decimal(24,2),
	`plannedRiskPercent` decimal(8,4),
	`grossPnlUsd` decimal(24,2),
	`netPnlUsd` decimal(24,2),
	`estimatedFeesUsd` decimal(24,2) NOT NULL DEFAULT '0.00',
	`maxExposureUsd` decimal(24,2),
	`exitReason` enum('STOP','TARGET','RULE_EXIT','END_OF_DATA','REJECTED'),
	`gateJson` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`rejectionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strategyBacktestTrades_id` PRIMARY KEY(`id`),
	CONSTRAINT `strategyBacktestTrades_run_sequence_unique` UNIQUE(`runId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `strategyLabAuditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`strategyId` int,
	`strategyRevisionId` int,
	`datasetId` int,
	`runId` int,
	`eventType` enum('STRATEGY_CREATED','STRATEGY_REVISED','STRATEGY_ARCHIVED','DATASET_CAPTURED','BACKTEST_STARTED','BACKTEST_COMPLETED','BACKTEST_REJECTED','BACKTEST_FAILED') NOT NULL,
	`detailsJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strategyLabAuditEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `strategyLabAuditEvents_user_key_unique` UNIQUE(`userId`,`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `userFeatureEntitlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`featureKey` varchar(40) NOT NULL,
	`tier` enum('FREE','PRO','ELITE') NOT NULL DEFAULT 'FREE',
	`enabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userFeatureEntitlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `userFeatureEntitlements_user_feature_unique` UNIQUE(`userId`,`featureKey`)
);
--> statement-breakpoint
CREATE INDEX `backtestDatasets_user_created_idx` ON `backtestDatasets` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paperStrategies_user_updated_idx` ON `paperStrategies` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `paperStrategyRevisions_user_created_idx` ON `paperStrategyRevisions` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `strategyBacktestRuns_user_created_idx` ON `strategyBacktestRuns` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `strategyBacktestRuns_strategy_created_idx` ON `strategyBacktestRuns` (`strategyId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `strategyBacktestTrades_run_signal_idx` ON `strategyBacktestTrades` (`runId`,`signalTime`);--> statement-breakpoint
CREATE INDEX `strategyLabAuditEvents_user_created_idx` ON `strategyLabAuditEvents` (`userId`,`createdAt`);