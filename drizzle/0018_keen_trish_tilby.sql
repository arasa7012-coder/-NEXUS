CREATE TABLE `onChainBalanceSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`nativeBalanceWei` varchar(120) NOT NULL,
	`observedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `onChainBalanceSnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `onChainBalanceSnapshots_wallet_observed_unique` UNIQUE(`walletId`,`observedAt`)
);
--> statement-breakpoint
CREATE TABLE `onChainProviderSyncs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncKey` varchar(128) NOT NULL,
	`walletId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`status` enum('SUCCEEDED','PARTIAL','RATE_LIMITED','FAILED','NOT_CONFIGURED') NOT NULL,
	`latencyMs` int,
	`requestCount` int NOT NULL DEFAULT 0,
	`errorCode` varchar(80),
	`nextPageKey` varchar(512),
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `onChainProviderSyncs_id` PRIMARY KEY(`id`),
	CONSTRAINT `onChainProviderSyncs_key_unique` UNIQUE(`syncKey`)
);
--> statement-breakpoint
CREATE TABLE `onChainTokenBalances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`contractAddress` varchar(64) NOT NULL,
	`tokenBalance` varchar(120) NOT NULL,
	`decimals` int,
	`symbol` varchar(80),
	`tokenName` varchar(200),
	`observedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `onChainTokenBalances_id` PRIMARY KEY(`id`),
	CONSTRAINT `onChainTokenBalances_wallet_contract_unique` UNIQUE(`walletId`,`contractAddress`)
);
--> statement-breakpoint
CREATE TABLE `onChainTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`transferKey` varchar(180) NOT NULL,
	`transactionHash` varchar(100) NOT NULL,
	`blockNumber` varchar(40),
	`observedAt` timestamp,
	`fromAddress` varchar(64),
	`toAddress` varchar(64),
	`category` varchar(40) NOT NULL,
	`asset` varchar(80),
	`contractAddress` varchar(64),
	`value` varchar(120),
	`sourcePayloadJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `onChainTransactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `onChainTransactions_wallet_transfer_unique` UNIQUE(`walletId`,`transferKey`)
);
--> statement-breakpoint
CREATE TABLE `onChainWalletScores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`smartMoneyScore` decimal(7,2),
	`confidenceScore` decimal(7,2),
	`classification` enum('ELITE','STRONG','PROMISING','NEUTRAL','WEAK','INSUFFICIENT_DATA') NOT NULL DEFAULT 'INSUFFICIENT_DATA',
	`scoreComponentsJson` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`dataQuality` enum('VERIFIED','PARTIAL','STALE','UNAVAILABLE') NOT NULL,
	`calculatedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `onChainWalletScores_id` PRIMARY KEY(`id`),
	CONSTRAINT `onChainWalletScores_wallet_calculated_unique` UNIQUE(`walletId`,`calculatedAt`)
);
--> statement-breakpoint
CREATE TABLE `onChainWallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chain` enum('ethereum','base') NOT NULL,
	`address` varchar(64) NOT NULL,
	`normalizedAddress` varchar(64) NOT NULL,
	`provider` varchar(40) NOT NULL DEFAULT 'alchemy',
	`dataQuality` enum('VERIFIED','PARTIAL','STALE','UNAVAILABLE') NOT NULL DEFAULT 'UNAVAILABLE',
	`providerStatus` varchar(32) NOT NULL DEFAULT 'NOT_CONFIGURED',
	`lastSuccessfulSyncAt` timestamp,
	`lastRequestedAt` timestamp,
	`lastErrorCode` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `onChainWallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `onChainWallets_chain_address_unique` UNIQUE(`chain`,`normalizedAddress`)
);
--> statement-breakpoint
CREATE TABLE `userOnChainWalletWatchlists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`walletId` int NOT NULL,
	`label` varchar(120),
	`tagsJson` text NOT NULL,
	`alertPreferencesJson` text NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userOnChainWalletWatchlists_id` PRIMARY KEY(`id`),
	CONSTRAINT `userOnChainWalletWatchlists_user_wallet_unique` UNIQUE(`userId`,`walletId`)
);
--> statement-breakpoint
ALTER TABLE `onChainBalanceSnapshots` ADD CONSTRAINT `onChainBalanceSnapshots_walletId_onChainWallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `onChainWallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `onChainProviderSyncs` ADD CONSTRAINT `onChainProviderSyncs_walletId_onChainWallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `onChainWallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `onChainTokenBalances` ADD CONSTRAINT `onChainTokenBalances_walletId_onChainWallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `onChainWallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `onChainTransactions` ADD CONSTRAINT `onChainTransactions_walletId_onChainWallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `onChainWallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `onChainWalletScores` ADD CONSTRAINT `onChainWalletScores_walletId_onChainWallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `onChainWallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userOnChainWalletWatchlists` ADD CONSTRAINT `userOnChainWalletWatchlists_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userOnChainWalletWatchlists` ADD CONSTRAINT `userOnChainWalletWatchlists_walletId_onChainWallets_id_fk` FOREIGN KEY (`walletId`) REFERENCES `onChainWallets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `onChainBalanceSnapshots_wallet_created_idx` ON `onChainBalanceSnapshots` (`walletId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `onChainProviderSyncs_wallet_synced_idx` ON `onChainProviderSyncs` (`walletId`,`syncedAt`);--> statement-breakpoint
CREATE INDEX `onChainProviderSyncs_provider_status_idx` ON `onChainProviderSyncs` (`provider`,`status`);--> statement-breakpoint
CREATE INDEX `onChainTokenBalances_wallet_observed_idx` ON `onChainTokenBalances` (`walletId`,`observedAt`);--> statement-breakpoint
CREATE INDEX `onChainTransactions_wallet_observed_idx` ON `onChainTransactions` (`walletId`,`observedAt`);--> statement-breakpoint
CREATE INDEX `onChainTransactions_hash_idx` ON `onChainTransactions` (`transactionHash`);--> statement-breakpoint
CREATE INDEX `onChainWalletScores_classification_idx` ON `onChainWalletScores` (`classification`);--> statement-breakpoint
CREATE INDEX `onChainWallets_provider_status_idx` ON `onChainWallets` (`provider`,`providerStatus`);--> statement-breakpoint
CREATE INDEX `userOnChainWalletWatchlists_user_active_idx` ON `userOnChainWalletWatchlists` (`userId`,`isActive`);
