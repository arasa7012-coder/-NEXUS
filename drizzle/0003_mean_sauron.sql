CREATE TABLE `binanceApiKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`apiKey` text NOT NULL,
	`apiSecret` text NOT NULL,
	`label` varchar(100),
	`isActive` int NOT NULL DEFAULT 1,
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `binanceApiKeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `binanceApiKeys` ADD CONSTRAINT `binanceApiKeys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;