CREATE TABLE `copilotDailyBriefings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`briefingDateUtc` varchar(10) NOT NULL,
	`evidenceFingerprint` varchar(64) NOT NULL,
	`evidenceJson` text NOT NULL,
	`briefingText` text NOT NULL,
	`responseMode` enum('AI_GROUNDED','DETERMINISTIC_FALLBACK','UNAVAILABLE') NOT NULL,
	`modelId` varchar(80),
	`generatedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `copilotDailyBriefings_id` PRIMARY KEY(`id`),
	CONSTRAINT `copilotDailyBriefings_user_date_unique` UNIQUE(`userId`,`briefingDateUtc`)
);
--> statement-breakpoint
CREATE TABLE `copilotEvidenceRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`requestKind` enum('MARKET','SETUP','RISK','PAPER_TRADE','PORTFOLIO','BACKTEST','BRIEFING') NOT NULL,
	`question` text NOT NULL,
	`evidenceFingerprint` varchar(64) NOT NULL,
	`evidenceJson` text NOT NULL,
	`responseText` text NOT NULL,
	`responseMode` enum('AI_GROUNDED','DETERMINISTIC_FALLBACK','UNAVAILABLE') NOT NULL,
	`modelId` varchar(80),
	`generatedAt` timestamp NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `copilotEvidenceRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `smartAlertEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`alertKey` varchar(160) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`severity` enum('INFO','WATCH','WARNING','CRITICAL') NOT NULL,
	`symbol` varchar(15),
	`positionId` int,
	`decisionId` int,
	`title` varchar(200) NOT NULL,
	`summary` text NOT NULL,
	`whyItMatters` text NOT NULL,
	`attentionContext` text NOT NULL,
	`dataQuality` varchar(20) NOT NULL,
	`dataSource` varchar(80),
	`providerUpdatedAt` timestamp,
	`evidenceJson` text NOT NULL,
	`observedAt` timestamp NOT NULL,
	`cooldownUntil` timestamp NOT NULL,
	`isRead` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `smartAlertEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `smartAlertEvents_user_key_unique` UNIQUE(`userId`,`alertKey`)
);
--> statement-breakpoint
CREATE TABLE `userCopilotPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`favoriteSymbolsJson` text NOT NULL,
	`preferredTimeframesJson` text NOT NULL,
	`enabledAlertTypesJson` text NOT NULL,
	`minimumAlertSeverity` enum('INFO','WATCH','WARNING','CRITICAL') NOT NULL DEFAULT 'WATCH',
	`alertCooldownMinutes` int NOT NULL DEFAULT 60,
	`dailyBriefingEnabled` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userCopilotPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `userCopilotPreferences_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `copilotDailyBriefings_user_generated_idx` ON `copilotDailyBriefings` (`userId`,`generatedAt`);--> statement-breakpoint
CREATE INDEX `copilotEvidenceRecords_user_request_idx` ON `copilotEvidenceRecords` (`userId`,`requestHash`);--> statement-breakpoint
CREATE INDEX `copilotEvidenceRecords_user_generated_idx` ON `copilotEvidenceRecords` (`userId`,`generatedAt`);--> statement-breakpoint
CREATE INDEX `smartAlertEvents_user_created_idx` ON `smartAlertEvents` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `smartAlertEvents_user_cooldown_idx` ON `smartAlertEvents` (`userId`,`cooldownUntil`);