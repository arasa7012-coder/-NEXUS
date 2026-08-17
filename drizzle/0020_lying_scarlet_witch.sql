CREATE TABLE `onChainWebhookDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL,
	`providerEventId` varchar(180) NOT NULL,
	`eventType` varchar(120) NOT NULL,
	`verificationState` enum('VERIFIED','REJECTED','NOT_CONFIGURED') NOT NULL,
	`processingState` enum('RECEIVED','PROCESSED','IGNORED','FAILED') NOT NULL DEFAULT 'RECEIVED',
	`payloadHash` varchar(64) NOT NULL,
	`affectedAddressesJson` text NOT NULL,
	`errorCode` varchar(100),
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `onChainWebhookDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `onChainWebhookDeliveries_provider_event_unique` UNIQUE(`provider`,`providerEventId`)
);
--> statement-breakpoint
CREATE INDEX `onChainWebhookDeliveries_state_idx` ON `onChainWebhookDeliveries` (`processingState`,`receivedAt`);