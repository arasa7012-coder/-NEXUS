CREATE TABLE `userChartViewPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`assetSymbol` varchar(15) NOT NULL,
	`source` enum('binance','coinbase') NOT NULL,
	`interval` enum('1m','5m','15m','1h','4h','1d') NOT NULL,
	`requestedStart` timestamp NOT NULL,
	`requestedEnd` timestamp NOT NULL,
	`visibleCandles` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userChartViewPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `userChartViewPreferences_user_chart_unique` UNIQUE(`userId`,`assetSymbol`,`source`,`interval`)
);
--> statement-breakpoint
CREATE INDEX `userChartViewPreferences_user_updated_idx` ON `userChartViewPreferences` (`userId`,`updatedAt`);