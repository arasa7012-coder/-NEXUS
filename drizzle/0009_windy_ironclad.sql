CREATE TABLE `backtestDatasetImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`datasetId` int,
	`fileName` varchar(255) NOT NULL,
	`sourceLabel` varchar(120) NOT NULL,
	`sourceClassification` enum('USER_IMPORTED_UNVERIFIED') NOT NULL DEFAULT 'USER_IMPORTED_UNVERIFIED',
	`csvFingerprint` varchar(64) NOT NULL,
	`validationStatus` enum('VERIFIED','REJECTED') NOT NULL,
	`validationErrorsJson` text NOT NULL,
	`rowCount` int NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	`verifiedAt` timestamp,
	CONSTRAINT `backtestDatasetImports_id` PRIMARY KEY(`id`),
	CONSTRAINT `backtestDatasetImports_user_csv_unique` UNIQUE(`userId`,`csvFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `backtestRunComparisons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`comparisonFingerprint` varchar(64) NOT NULL,
	`runIdsJson` text NOT NULL,
	`comparisonJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backtestRunComparisons_id` PRIMARY KEY(`id`),
	CONSTRAINT `backtestRunComparisons_user_fingerprint_unique` UNIQUE(`userId`,`comparisonFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `parameterSearchCandidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`searchId` int NOT NULL,
	`sequence` int NOT NULL,
	`candidateFingerprint` varchar(64) NOT NULL,
	`parameterJson` text NOT NULL,
	`status` enum('COMPLETED','REJECTED','FAILED') NOT NULL,
	`resultJson` text,
	`rejectionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parameterSearchCandidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `parameterSearchCandidates_search_sequence_unique` UNIQUE(`searchId`,`sequence`),
	CONSTRAINT `parameterSearchCandidates_search_fingerprint_unique` UNIQUE(`searchId`,`candidateFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `parameterSearchPeriodResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` int NOT NULL,
	`period` enum('TRAINING','VALIDATION','OUT_OF_SAMPLE') NOT NULL,
	`rangeStart` timestamp NOT NULL,
	`rangeEnd` timestamp NOT NULL,
	`candleCount` int NOT NULL,
	`metricsJson` text NOT NULL,
	`warningJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parameterSearchPeriodResults_id` PRIMARY KEY(`id`),
	CONSTRAINT `parameterSearchPeriodResults_candidate_period_unique` UNIQUE(`candidateId`,`period`)
);
--> statement-breakpoint
CREATE TABLE `parameterSearches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`strategyId` int NOT NULL,
	`strategyRevisionId` int NOT NULL,
	`datasetId` int NOT NULL,
	`entitlementKey` varchar(40) NOT NULL,
	`engineVersion` varchar(32) NOT NULL,
	`searchFingerprint` varchar(64) NOT NULL,
	`status` enum('QUEUED','RUNNING','COMPLETED','REJECTED','FAILED') NOT NULL DEFAULT 'QUEUED',
	`parameterPlanJson` text NOT NULL,
	`periodPlanJson` text NOT NULL,
	`candidateCount` int NOT NULL,
	`rejectionReason` text,
	`robustnessJson` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parameterSearches_id` PRIMARY KEY(`id`),
	CONSTRAINT `parameterSearches_user_fingerprint_unique` UNIQUE(`userId`,`searchFingerprint`)
);
--> statement-breakpoint
CREATE INDEX `backtestDatasetImports_user_created_idx` ON `backtestDatasetImports` (`userId`,`importedAt`);--> statement-breakpoint
CREATE INDEX `backtestRunComparisons_user_created_idx` ON `backtestRunComparisons` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `parameterSearches_user_created_idx` ON `parameterSearches` (`userId`,`createdAt`);