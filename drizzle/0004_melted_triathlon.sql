CREATE TABLE `exchangeApiKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`exchange` enum('binance','coinbase','okx','kraken','bybit') NOT NULL,
	`apiKey` text NOT NULL,
	`apiSecret` text NOT NULL,
	`passphrase` text,
	`label` varchar(100),
	`isActive` int NOT NULL DEFAULT 1,
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exchangeApiKeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`message` text NOT NULL,
	`type` enum('price_alert','portfolio_update','trade_signal','system') NOT NULL,
	`relatedCryptoId` int,
	`isRead` int NOT NULL DEFAULT 0,
	`actionUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolioSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolioId` int NOT NULL,
	`totalValue` varchar(30) NOT NULL,
	`totalCost` varchar(30) NOT NULL,
	`totalProfit` varchar(30) NOT NULL,
	`profitPercentage` varchar(10) NOT NULL,
	`snapshotDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolioSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `priceAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cryptoId` int NOT NULL,
	`alertType` enum('above','below','change_percent') NOT NULL,
	`targetPrice` varchar(30),
	`changePercent` varchar(10),
	`isActive` int NOT NULL DEFAULT 1,
	`hasTriggered` int NOT NULL DEFAULT 0,
	`lastTriggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `priceAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `exchangeApiKeys` ADD CONSTRAINT `exchangeApiKeys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_relatedCryptoId_cryptocurrencies_id_fk` FOREIGN KEY (`relatedCryptoId`) REFERENCES `cryptocurrencies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolioSnapshots` ADD CONSTRAINT `portfolioSnapshots_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceAlerts` ADD CONSTRAINT `priceAlerts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `priceAlerts` ADD CONSTRAINT `priceAlerts_cryptoId_cryptocurrencies_id_fk` FOREIGN KEY (`cryptoId`) REFERENCES `cryptocurrencies`(`id`) ON DELETE no action ON UPDATE no action;