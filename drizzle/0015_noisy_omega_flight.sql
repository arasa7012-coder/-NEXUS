CREATE TABLE `notificationDeviceRegistrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`devicePublicId` varchar(80) NOT NULL,
	`platform` enum('WEB','IOS','ANDROID','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
	`permissionState` enum('DEFAULT','GRANTED','DENIED','UNSUPPORTED','REVOKED') NOT NULL DEFAULT 'DEFAULT',
	`tokenLifecycleState` enum('NOT_REQUESTED','PROVIDER_UNCONFIGURED','REGISTERED','REVOKED','EXPIRED') NOT NULL DEFAULT 'NOT_REQUESTED',
	`tokenFingerprint` varchar(64),
	`consentedAt` timestamp,
	`revokedAt` timestamp,
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationDeviceRegistrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationDeviceRegistrations_user_device_unique` UNIQUE(`userId`,`devicePublicId`)
);
--> statement-breakpoint
CREATE TABLE `paperPositionMonitoringEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(160) NOT NULL,
	`userId` int NOT NULL,
	`simulationPortfolioId` int NOT NULL,
	`positionId` int NOT NULL,
	`symbol` varchar(15) NOT NULL,
	`previousState` enum('OPEN','WATCH','STOP_APPROACHING','TARGET_APPROACHING','RISK_INCREASED','DATA_STALE','PROTECTION_TRIGGERED','CLOSED'),
	`nextState` enum('OPEN','WATCH','STOP_APPROACHING','TARGET_APPROACHING','RISK_INCREASED','DATA_STALE','PROTECTION_TRIGGERED','CLOSED') NOT NULL,
	`severity` enum('INFO','WATCH','WARNING','CRITICAL') NOT NULL,
	`currentValue` varchar(120),
	`previousValue` varchar(120),
	`riskLevel` enum('LOW','MODERATE','HIGH','EXTREME'),
	`marketRegime` varchar(40),
	`dataQuality` varchar(20) NOT NULL,
	`dataSource` varchar(80),
	`providerUpdatedAt` timestamp,
	`triggerReason` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`observedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paperPositionMonitoringEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `paperPositionMonitoringEvents_user_key_unique` UNIQUE(`userId`,`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `paperPositionMonitoringStates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`simulationPortfolioId` int NOT NULL,
	`positionId` int NOT NULL,
	`symbol` varchar(15) NOT NULL,
	`state` enum('OPEN','WATCH','STOP_APPROACHING','TARGET_APPROACHING','RISK_INCREASED','DATA_STALE','PROTECTION_TRIGGERED','CLOSED') NOT NULL DEFAULT 'OPEN',
	`previousState` enum('OPEN','WATCH','STOP_APPROACHING','TARGET_APPROACHING','RISK_INCREASED','DATA_STALE','PROTECTION_TRIGGERED','CLOSED'),
	`currentPriceUsd` decimal(24,8),
	`previousPriceUsd` decimal(24,8),
	`exposurePercent` decimal(8,4),
	`riskLevel` enum('LOW','MODERATE','HIGH','EXTREME'),
	`marketRegime` varchar(40),
	`dataQuality` varchar(20) NOT NULL,
	`dataSource` varchar(80),
	`providerUpdatedAt` timestamp,
	`triggerReason` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`observedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paperPositionMonitoringStates_id` PRIMARY KEY(`id`),
	CONSTRAINT `paperPositionMonitoringStates_user_position_unique` UNIQUE(`userId`,`positionId`)
);
--> statement-breakpoint
CREATE TABLE `userNotificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`inAppConsent` int NOT NULL DEFAULT 0,
	`emailConsent` int NOT NULL DEFAULT 0,
	`pushConsent` int NOT NULL DEFAULT 0,
	`emailProviderStatus` enum('UNCONFIGURED','READY') NOT NULL DEFAULT 'UNCONFIGURED',
	`pushProviderStatus` enum('UNCONFIGURED','READY') NOT NULL DEFAULT 'UNCONFIGURED',
	`dailyBriefingScheduleIntent` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userNotificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `userNotificationPreferences_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `smartAlertEvents` ADD `alertGroupKey` varchar(120);--> statement-breakpoint
ALTER TABLE `smartAlertEvents` ADD `strategyId` int;--> statement-breakpoint
ALTER TABLE `smartAlertEvents` ADD `currentValue` varchar(120);--> statement-breakpoint
ALTER TABLE `smartAlertEvents` ADD `previousValue` varchar(120);--> statement-breakpoint
CREATE INDEX `notificationDeviceRegistrations_user_status_idx` ON `notificationDeviceRegistrations` (`userId`,`permissionState`);--> statement-breakpoint
CREATE INDEX `paperPositionMonitoringEvents_user_created_idx` ON `paperPositionMonitoringEvents` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paperPositionMonitoringEvents_position_created_idx` ON `paperPositionMonitoringEvents` (`positionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `paperPositionMonitoringStates_user_state_idx` ON `paperPositionMonitoringStates` (`userId`,`state`);--> statement-breakpoint
CREATE INDEX `paperPositionMonitoringStates_portfolio_updated_idx` ON `paperPositionMonitoringStates` (`simulationPortfolioId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `smartAlertEvents_user_group_idx` ON `smartAlertEvents` (`userId`,`alertGroupKey`);