CREATE TABLE `simulationPendingOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`simulationPortfolioId` int NOT NULL,
	`decisionId` int NOT NULL,
	`symbol` varchar(15) NOT NULL,
	`side` enum('buy','sell') NOT NULL,
	`orderType` enum('limit','stop') NOT NULL,
	`quantity` decimal(30,12) NOT NULL,
	`triggerPriceUsd` decimal(24,8) NOT NULL,
	`stopPriceUsd` decimal(24,8) NOT NULL,
	`targetPriceUsd` decimal(24,8) NOT NULL,
	`status` enum('ACTIVE','FILLED','CANCELLED','REJECTED') NOT NULL DEFAULT 'ACTIVE',
	`filledTransactionId` int,
	`cancelReason` text,
	`filledAt` timestamp,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `simulationPendingOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `simulationPendingOrders_decision_unique` UNIQUE(`decisionId`)
);
--> statement-breakpoint
CREATE TABLE `simulationRiskEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`simulationPortfolioId` int,
	`positionId` int,
	`decisionId` int,
	`transactionId` int,
	`symbol` varchar(15),
	`eventType` enum('EMERGENCY_STOP_ACTIVATED','EMERGENCY_STOP_RESET','COOLDOWN_STARTED','COOLDOWN_ENDED','PENDING_ORDER_CANCELLED','PENDING_ORDER_FILLED','STOP_OBSERVED','TARGET_OBSERVED','REGIME_CHANGED','DATA_UNAVAILABLE','MONITORING_FAILURE') NOT NULL,
	`severity` enum('INFO','WARNING','CRITICAL') NOT NULL,
	`observedPriceUsd` decimal(24,8),
	`dataSource` varchar(80),
	`providerUpdatedAt` timestamp,
	`detailsJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `simulationRiskEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `simulationRiskEvents_user_key_unique` UNIQUE(`userId`,`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `simulationRiskSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`riskPerTradePercent` decimal(8,4) NOT NULL DEFAULT '1.0000',
	`maxDailyLossPercent` decimal(8,4) NOT NULL DEFAULT '3.0000',
	`maxDailyDrawdownPercent` decimal(8,4) NOT NULL DEFAULT '5.0000',
	`maxOpenPositions` int NOT NULL DEFAULT 10,
	`maxPortfolioExposurePercent` decimal(8,4) NOT NULL DEFAULT '80.0000',
	`maxAssetExposurePercent` decimal(8,4) NOT NULL DEFAULT '25.0000',
	`stopMethod` enum('fixed','atr','structure') NOT NULL DEFAULT 'atr',
	`fixedStopPercent` decimal(8,4) NOT NULL DEFAULT '2.0000',
	`atrMultiplier` decimal(8,4) NOT NULL DEFAULT '2.0000',
	`structureBufferBps` int NOT NULL DEFAULT 10,
	`minimumRewardRisk` decimal(8,4) NOT NULL DEFAULT '2.0000',
	`consecutiveLossLimit` int NOT NULL DEFAULT 3,
	`cooldownMinutes` int NOT NULL DEFAULT 60,
	`feeBps` int NOT NULL DEFAULT 10,
	`slippageBps` int NOT NULL DEFAULT 5,
	`blockHighVolatility` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `simulationRiskSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `simulationRiskSettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `simulationSafetyStates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`riskDayUtc` varchar(10) NOT NULL,
	`dayStartEquityUsd` decimal(24,2) NOT NULL,
	`dayPeakEquityUsd` decimal(24,2) NOT NULL,
	`consecutiveLosses` int NOT NULL DEFAULT 0,
	`cooldownUntil` timestamp,
	`emergencyStopActive` int NOT NULL DEFAULT 0,
	`emergencyStopReason` text,
	`emergencyStopActivatedAt` timestamp,
	`emergencyStopResetAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `simulationSafetyStates_id` PRIMARY KEY(`id`),
	CONSTRAINT `simulationSafetyStates_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `simulationTradeDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestKey` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`simulationPortfolioId` int NOT NULL,
	`transactionId` int,
	`pendingOrderId` int,
	`symbol` varchar(15) NOT NULL,
	`side` enum('buy','sell') NOT NULL,
	`orderType` enum('market','limit','stop') NOT NULL,
	`entryPriceUsd` decimal(24,8) NOT NULL,
	`stopMethod` enum('fixed','atr','structure') NOT NULL,
	`stopPriceUsd` decimal(24,8) NOT NULL,
	`targetPriceUsd` decimal(24,8) NOT NULL,
	`quantity` decimal(30,12) NOT NULL,
	`notionalUsd` decimal(24,2) NOT NULL,
	`estimatedFeesUsd` decimal(24,2) NOT NULL,
	`plannedRiskUsd` decimal(24,2) NOT NULL,
	`plannedRiskPercent` decimal(8,4) NOT NULL,
	`rewardRiskRatio` decimal(10,4) NOT NULL,
	`riskLevel` enum('LOW','MODERATE','HIGH','EXTREME') NOT NULL,
	`intelligenceOpportunityScore` decimal(7,2),
	`intelligenceRiskScore` decimal(7,2),
	`intelligenceSignalStrength` decimal(7,2),
	`marketRegime` varchar(40),
	`dataQuality` varchar(20) NOT NULL,
	`dataSource` varchar(80) NOT NULL,
	`providerUpdatedAt` timestamp,
	`decision` enum('ACCEPTED','REJECTED') NOT NULL,
	`checkResultsJson` text NOT NULL,
	`reasonsJson` text NOT NULL,
	`rejectionReason` text,
	`planExpiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `simulationTradeDecisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `simulationTradeDecisions_user_request_unique` UNIQUE(`userId`,`requestKey`)
);
--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `stopMethod` enum('fixed','atr','structure');--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `stopPriceUsd` decimal(24,8);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `targetPriceUsd` decimal(24,8);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `plannedRiskUsd` decimal(24,2);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `plannedRiskPercent` decimal(8,4);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `riskLevel` enum('LOW','MODERATE','HIGH','EXTREME');--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `openingDecisionId` int;--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `intelligenceOpportunityScore` decimal(7,2);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `intelligenceRiskScore` decimal(7,2);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `intelligenceSignalStrength` decimal(7,2);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `marketRegime` varchar(40);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `dataQuality` varchar(20);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `dataSource` varchar(80);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `providerUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `protectionUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `monitorLastEvaluatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `monitorLastPriceUsd` decimal(24,8);--> statement-breakpoint
ALTER TABLE `simulationPositions` ADD `monitorLastRegime` varchar(40);--> statement-breakpoint
ALTER TABLE `simulationTransactions` ADD `decisionId` int;--> statement-breakpoint
ALTER TABLE `simulationTransactions` ADD `purpose` enum('OPEN','REDUCE','PROTECTIVE_STOP','TAKE_PROFIT') DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE `simulationTransactions` ADD `feeBps` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `simulationTransactions` ADD `slippageBps` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `simulationTransactions` ADD `estimatedFeesUsd` decimal(24,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `simulationTransactions` ADD `realizedPnlUsd` decimal(24,2);--> statement-breakpoint
ALTER TABLE `simulationTransactions` ADD `protectionReason` text;--> statement-breakpoint
CREATE INDEX `simulationPendingOrders_user_status_idx` ON `simulationPendingOrders` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `simulationRiskEvents_user_created_idx` ON `simulationRiskEvents` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `simulationTradeDecisions_user_created_idx` ON `simulationTradeDecisions` (`userId`,`createdAt`);