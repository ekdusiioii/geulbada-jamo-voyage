CREATE TABLE `player_scores` (
	`nickname` text PRIMARY KEY NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
