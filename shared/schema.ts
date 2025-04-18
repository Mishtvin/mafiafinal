import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

/**
 * Интерфейс для информации о слоте пользователя
 */
export interface SlotInfo {
  userId: string;
  slotNumber: number;
}

/**
 * Состояния игроков
 */
export interface PlayerStates {
  // userId -> true (убит) / false (жив)
  killedPlayers: Record<string, boolean>;
}
