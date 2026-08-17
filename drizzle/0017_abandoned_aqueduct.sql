CREATE TABLE `billingAuditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(128) NOT NULL,
	`userId` int,
	`source` enum('SYSTEM','USER','ADMIN','PROVIDER') NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`detailsJson` text NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `billingAuditEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `billingAuditEvents_key_unique` UNIQUE(`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `billingProviderCustomers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`providerCustomerId` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billingProviderCustomers_id` PRIMARY KEY(`id`),
	CONSTRAINT `billingProviderCustomers_user_provider_unique` UNIQUE(`userId`,`provider`),
	CONSTRAINT `billingProviderCustomers_provider_customer_unique` UNIQUE(`provider`,`providerCustomerId`)
);
--> statement-breakpoint
CREATE TABLE `entitlementDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`decisionKey` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`featureKey` varchar(64) NOT NULL,
	`requestedPlan` varchar(16) NOT NULL,
	`effectivePlan` varchar(16) NOT NULL,
	`subscriptionState` varchar(16) NOT NULL,
	`allowed` int NOT NULL,
	`reasonCode` varchar(80) NOT NULL,
	`limitValue` int,
	`usageValue` int,
	`evidenceJson` text NOT NULL,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entitlementDecisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `entitlementDecisions_key_unique` UNIQUE(`decisionKey`)
);
--> statement-breakpoint
CREATE TABLE `entitlementUsagePeriods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`metric` varchar(64) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`usedCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entitlementUsagePeriods_id` PRIMARY KEY(`id`),
	CONSTRAINT `entitlementUsagePeriods_user_metric_period_unique` UNIQUE(`userId`,`metric`,`periodStart`)
);
--> statement-breakpoint
CREATE TABLE `paymentWebhookDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL,
	`providerEventId` varchar(160) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`verificationState` enum('RECEIVED','VERIFIED','REJECTED') NOT NULL DEFAULT 'RECEIVED',
	`processingState` enum('PENDING','PROCESSED','IGNORED','FAILED') NOT NULL DEFAULT 'PENDING',
	`payloadHash` varchar(64) NOT NULL,
	`payloadJson` text,
	`errorMessage` text,
	`processedAt` timestamp,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paymentWebhookDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentWebhookDeliveries_provider_event_unique` UNIQUE(`provider`,`providerEventId`)
);
--> statement-breakpoint
CREATE TABLE `userSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`plan` enum('FREE','PRO','ELITE') NOT NULL DEFAULT 'FREE',
	`state` enum('FREE','TRIALING','ACTIVE','PAST_DUE','CANCELED','EXPIRED') NOT NULL DEFAULT 'FREE',
	`provider` varchar(40),
	`providerSubscriptionId` varchar(160),
	`trialStartedAt` timestamp,
	`trialEndsAt` timestamp,
	`currentPeriodEndsAt` timestamp,
	`canceledAt` timestamp,
	`expiresAt` timestamp,
	`stateReason` varchar(180) NOT NULL DEFAULT 'INITIAL_FREE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `userSubscriptions_user_unique` UNIQUE(`userId`),
	CONSTRAINT `userSubscriptions_provider_subscription_unique` UNIQUE(`provider`,`providerSubscriptionId`)
);
--> statement-breakpoint
CREATE INDEX `billingAuditEvents_user_occurred_idx` ON `billingAuditEvents` (`userId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `entitlementDecisions_user_feature_idx` ON `entitlementDecisions` (`userId`,`featureKey`,`decidedAt`);--> statement-breakpoint
CREATE INDEX `entitlementUsagePeriods_user_period_idx` ON `entitlementUsagePeriods` (`userId`,`periodEnd`);--> statement-breakpoint
CREATE INDEX `paymentWebhookDeliveries_state_idx` ON `paymentWebhookDeliveries` (`processingState`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `userSubscriptions_state_idx` ON `userSubscriptions` (`state`,`currentPeriodEndsAt`);