import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Таблица для хранения последних позиций (слотов) пользователей
export const userSlots = pgTable("user_slots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(), // уникальный идентификатор пользователя
  slotNumber: integer("slot_number").notNull(), // номер слота
  roomName: text("room_name").notNull(), // имя комнаты
  lastUsed: timestamp("last_used").defaultNow().notNull(), // время последнего использования
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertUserSlotSchema = createInsertSchema(userSlots).pick({
  userId: true,
  slotNumber: true,
  roomName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertUserSlot = z.infer<typeof insertUserSlotSchema>;
export type UserSlot = typeof userSlots.$inferSelect;
