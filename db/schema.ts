import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const playerScores = sqliteTable("player_scores", {
  nickname: text("nickname").primaryKey(),
  bestScore: integer("best_score").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
