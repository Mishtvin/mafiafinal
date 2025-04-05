import { db } from "./db";
import { userSlots, type UserSlot, type InsertUserSlot } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

/**
 * Интерфейс для управления хранением информации о слотах пользователей
 */
export interface ISlotStorage {
  // Получить последний используемый слот пользователя в указанной комнате
  getUserLastSlot(userId: string, roomName: string): Promise<number | null>;
  
  // Сохранить информацию о слоте пользователя
  saveUserSlot(userId: string, slotNumber: number, roomName: string): Promise<void>;
}

/**
 * Реализация хранения информации о слотах в базе данных PostgreSQL
 */
export class DatabaseSlotStorage implements ISlotStorage {
  /**
   * Получает последний слот, который использовал пользователь в указанной комнате
   * @param userId Идентификатор пользователя
   * @param roomName Название комнаты
   * @returns Номер слота или null, если информация отсутствует
   */
  async getUserLastSlot(userId: string, roomName: string): Promise<number | null> {
    try {
      // Ищем запись о последней позиции пользователя в указанной комнате
      const [userSlot] = await db
        .select()
        .from(userSlots)
        .where(
          and(
            eq(userSlots.userId, userId),
            eq(userSlots.roomName, roomName)
          )
        )
        .orderBy(desc(userSlots.lastUsed))
        .limit(1);
      
      return userSlot ? userSlot.slotNumber : null;
    } catch (error) {
      console.error('Ошибка при получении последнего слота пользователя:', error);
      return null;
    }
  }
  
  /**
   * Сохраняет информацию о текущем слоте пользователя
   * @param userId Идентификатор пользователя
   * @param slotNumber Номер слота
   * @param roomName Название комнаты
   */
  async saveUserSlot(userId: string, slotNumber: number, roomName: string): Promise<void> {
    try {
      // Проверяем, есть ли уже запись для этого пользователя
      const [existingUserSlot] = await db
        .select()
        .from(userSlots)
        .where(
          and(
            eq(userSlots.userId, userId),
            eq(userSlots.roomName, roomName)
          )
        )
        .limit(1);
      
      const now = new Date();
      
      if (existingUserSlot) {
        // Обновляем существующую запись
        await db
          .update(userSlots)
          .set({ 
            slotNumber: slotNumber,
            lastUsed: now
          })
          .where(eq(userSlots.id, existingUserSlot.id));
      } else {
        // Создаем новую запись
        await db
          .insert(userSlots)
          .values({
            userId: userId,
            slotNumber: slotNumber,
            roomName: roomName,
            lastUsed: now
          });
      }
    } catch (error) {
      console.error('Ошибка при сохранении слота пользователя:', error);
    }
  }
}

// Создаем единственный экземпляр хранилища
export const slotStorage = new DatabaseSlotStorage();