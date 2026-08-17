CREATE TABLE `nexusActionApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`actionType` varchar(100) NOT NULL,
	`requestedBy` enum('USER','SYSTEM') NOT NULL,
	`previewStatus` enum('SAFE','REVIEW_REQUIRED','HIGH_RISK','BLOCKED') NOT NULL,
	`whatText` text NOT NULL,
	`whyText` text NOT NULL,
	`impactText` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`requiredPermissionsJson` text NOT NULL,
	`state` enum('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED','ESCALATED') NOT NULL DEFAULT 'PENDING',
	`expiresAt` timestamp,
	`resolvedAt` timestamp,
	`resolutionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nexusActionApprovals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nexusActivityEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`source` enum('MONITORING','RISK_ENGINE','SMART_ALERTS','SHIELD','COPILOT','APPROVAL','HEARTBEAT','USER') NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`severity` enum('INFO','LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'INFO',
	`stateBeforeJson` text,
	`stateAfterJson` text,
	`evidenceJson` text NOT NULL,
	`relatedAlertId` int,
	`relatedApprovalId` int,
	`correlationKey` varchar(160),
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nexusActivityEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nexusIncidentEventLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incidentId` int NOT NULL,
	`activityEventId` int NOT NULL,
	`linkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nexusIncidentEventLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `nexusIncidentEventLinks_unique` UNIQUE(`incidentId`,`activityEventId`)
);
--> statement-breakpoint
CREATE TABLE `nexusIncidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`incidentKey` varchar(100) NOT NULL,
	`severity` enum('MEDIUM','HIGH','CRITICAL') NOT NULL,
	`state` enum('OPEN','INVESTIGATING','MITIGATED','RESOLVED','FALSE_POSITIVE') NOT NULL DEFAULT 'OPEN',
	`summary` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`firstDetectedAt` timestamp NOT NULL,
	`lastUpdatedAt` timestamp NOT NULL,
	`resolution` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nexusIncidents_id` PRIMARY KEY(`id`),
	CONSTRAINT `nexusIncidents_user_key_unique` UNIQUE(`userId`,`incidentKey`)
);
--> statement-breakpoint
CREATE TABLE `nexusMonitoringSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleKey` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`enabled` int NOT NULL DEFAULT 0,
	`engineStatus` enum('UNCONFIGURED','OPERATIONAL','DEGRADED','FAILED') NOT NULL DEFAULT 'UNCONFIGURED',
	`lastCheckedAt` timestamp,
	`lastEventAt` timestamp,
	`dataFreshnessState` enum('FRESH','STALE','UNAVAILABLE','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nexusMonitoringSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `nexusMonitoringSchedules_key_unique` UNIQUE(`scheduleKey`)
);
--> statement-breakpoint
CREATE TABLE `nexusSecurityModes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enabled` int NOT NULL DEFAULT 0,
	`activatedBy` enum('USER','RULE') NOT NULL DEFAULT 'USER',
	`reason` text NOT NULL,
	`activatedAt` timestamp NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nexusSecurityModes_id` PRIMARY KEY(`id`),
	CONSTRAINT `nexusSecurityModes_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `nexusShieldFindings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`ruleCode` varchar(64) NOT NULL,
	`riskLevel` enum('SAFE','REVIEW_REQUIRED','HIGH_RISK','BLOCKED') NOT NULL,
	`reason` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`recommendedAction` varchar(180) NOT NULL,
	`status` enum('OPEN','SUPPRESSED','RESOLVED') NOT NULL DEFAULT 'OPEN',
	`relatedActivityEventId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `nexusShieldFindings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `nexusActionApprovals_user_state_idx` ON `nexusActionApprovals` (`userId`,`state`,`createdAt`);--> statement-breakpoint
CREATE INDEX `nexusActionApprovals_user_action_idx` ON `nexusActionApprovals` (`userId`,`actionType`);--> statement-breakpoint
CREATE INDEX `nexusActivityEvents_user_occurred_idx` ON `nexusActivityEvents` (`userId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `nexusActivityEvents_correlation_idx` ON `nexusActivityEvents` (`correlationKey`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `nexusActivityEvents_source_type_idx` ON `nexusActivityEvents` (`source`,`eventType`);--> statement-breakpoint
CREATE INDEX `nexusIncidentEventLinks_event_idx` ON `nexusIncidentEventLinks` (`activityEventId`);--> statement-breakpoint
CREATE INDEX `nexusIncidents_user_state_idx` ON `nexusIncidents` (`userId`,`state`,`lastUpdatedAt`);--> statement-breakpoint
CREATE INDEX `nexusMonitoringSchedules_task_uid_idx` ON `nexusMonitoringSchedules` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `nexusShieldFindings_user_status_idx` ON `nexusShieldFindings` (`userId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `nexusShieldFindings_rule_idx` ON `nexusShieldFindings` (`ruleCode`,`createdAt`);