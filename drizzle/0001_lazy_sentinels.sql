CREATE TABLE `aiPredictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cryptoId` int NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`prediction` enum('BUY','SELL','HOLD') NOT NULL,
	`explanation` text NOT NULL,
	`sentimentScore` varchar(10),
	`newsSummary` text,
	`timestamp` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `aiPredictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cryptoId` int NOT NULL,
	`type` enum('price_level','ta_signal','ai_signal') NOT NULL,
	`condition` text NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`triggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cryptoId` int NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`open` varchar(20) NOT NULL,
	`high` varchar(20) NOT NULL,
	`low` varchar(20) NOT NULL,
	`close` varchar(20) NOT NULL,
	`volume` varchar(30) NOT NULL,
	`timestamp` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cryptocurrencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(10) NOT NULL,
	`name` varchar(50) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cryptocurrencies_id` PRIMARY KEY(`id`),
	CONSTRAINT `cryptocurrencies_symbol_unique` UNIQUE(`symbol`)
);
--> statement-breakpoint
ALTER TABLE `aiPredictions` ADD CONSTRAINT `aiPredictions_cryptoId_cryptocurrencies_id_fk` FOREIGN KEY (`cryptoId`) REFERENCES `cryptocurrencies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_cryptoId_cryptocurrencies_id_fk` FOREIGN KEY (`cryptoId`) REFERENCES `cryptocurrencies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candles` ADD CONSTRAINT `candles_cryptoId_cryptocurrencies_id_fk` FOREIGN KEY (`cryptoId`) REFERENCES `cryptocurrencies`(`id`) ON DELETE no action ON UPDATE no action;