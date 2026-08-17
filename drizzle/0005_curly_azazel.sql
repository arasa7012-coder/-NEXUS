CREATE TABLE `simulationPortfolios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL DEFAULT 'Simulation Portfolio',
	`quoteCurrency` varchar(10) NOT NULL DEFAULT 'USD',
	`initialCashUsd` decimal(24,2) NOT NULL DEFAULT '100000.00',
	`cashBalanceUsd` decimal(24,2) NOT NULL DEFAULT '100000.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `simulationPortfolios_id` PRIMARY KEY(`id`),
	CONSTRAINT `simulationPortfolios_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `simulationPositions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`simulationPortfolioId` int NOT NULL,
	`symbol` varchar(15) NOT NULL,
	`quantity` decimal(30,12) NOT NULL,
	`averageCostUsd` decimal(24,8) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `simulationPositions_id` PRIMARY KEY(`id`),
	CONSTRAINT `simulationPositions_portfolio_symbol_unique` UNIQUE(`simulationPortfolioId`,`symbol`)
);
--> statement-breakpoint
CREATE TABLE `simulationTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`simulationPortfolioId` int NOT NULL,
	`symbol` varchar(15) NOT NULL,
	`side` enum('buy','sell') NOT NULL,
	`orderType` enum('market','limit','stop') NOT NULL,
	`quantity` decimal(30,12) NOT NULL,
	`referencePriceUsd` decimal(24,8) NOT NULL,
	`notionalUsd` decimal(24,2) NOT NULL,
	`marketSource` varchar(40) NOT NULL,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `simulationTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
