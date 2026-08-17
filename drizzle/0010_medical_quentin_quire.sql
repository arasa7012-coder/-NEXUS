CREATE TABLE `csvSourceAuthentications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`importId` int NOT NULL,
	`datasetId` int,
	`publisherKeyId` int,
	`requiredKeyFingerprint` varchar(64),
	`declaredCsvFingerprint` varchar(64),
	`observedCsvFingerprint` varchar(64) NOT NULL,
	`manifestJson` text,
	`authenticationStatus` enum('VERIFIED','REJECTED','UNSIGNED') NOT NULL,
	`failureCode` varchar(80),
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `csvSourceAuthentications_id` PRIMARY KEY(`id`),
	CONSTRAINT `csvSourceAuthentications_import_unique` UNIQUE(`importId`)
);
--> statement-breakpoint
CREATE TABLE `csvTrustedPublisherKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`publicKeySpkiBase64` varchar(1024) NOT NULL,
	`keyFingerprint` varchar(64) NOT NULL,
	`status` enum('ACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `csvTrustedPublisherKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `csvTrustedPublisherKeys_user_fingerprint_unique` UNIQUE(`userId`,`keyFingerprint`)
);
--> statement-breakpoint
CREATE INDEX `csvSourceAuthentications_user_created_idx` ON `csvSourceAuthentications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `csvTrustedPublisherKeys_user_status_idx` ON `csvTrustedPublisherKeys` (`userId`,`status`);