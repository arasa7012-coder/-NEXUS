CREATE TABLE `marketWatchlistEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`assetId` varchar(80) NOT NULL,
	`assetType` enum('CRYPTO','STABLECOIN','COMMODITY','FOREX','STOCK','INDEX','REAL_WORLD_ASSET') NOT NULL,
	`symbol` varchar(30) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketWatchlistEntries_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketWatchlistEntries_user_asset_unique` UNIQUE(`userId`,`assetId`)
);
--> statement-breakpoint
CREATE INDEX `marketWatchlistEntries_user_updated_idx` ON `marketWatchlistEntries` (`userId`,`updatedAt`);