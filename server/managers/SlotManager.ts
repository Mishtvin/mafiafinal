import { SlotInfo } from '@shared/schema';
import { globalEvents } from './EventEmitter';

/**
 * Менеджер слотов - управляет распределением пользователей по слотам
 */
export class SlotManager {
  // Карта назначенных слотов (номер слота -> ID пользователя)
  private slotAssignments = new Map<number, string>();
  
  // Обратная карта для быстрого доступа (ID пользователя -> номер слота)
  private userSlots = new Map<string, number>();
  
  // Максимальное количество слотов
  private readonly maxSlots = 12;
  
  constructor() {
    console.log('SlotManager: Инициализирован');
    
    // Проверка целостности данных каждые 30 секунд
    setInterval(() => {
      this.validateIntegrity();
    }, 30000);
  }
  
  /**
   * Получить все текущие назначения слотов
   */
  getAllSlotAssignments(): SlotInfo[] {
    const slotInfos: SlotInfo[] = [];
    
    this.slotAssignments.forEach((userId, slotNumber) => {
      slotInfos.push({
        userId,
        slotNumber
      });
    });
    
    return slotInfos;
  }
  
  /**
   * Получить номер слота пользователя
   * @param userId Идентификатор пользователя
   */
  getUserSlot(userId: string): number | undefined {
    return this.userSlots.get(userId);
  }
  
  /**
   * Назначить слот пользователю
   * @param userId Идентификатор пользователя
   * @param slotNumber Номер слота для назначения
   * @returns true, если слот успешно назначен
   */
  assignSlot(userId: string, slotNumber: number): boolean {
    // Проверка корректности номера слота
    if (slotNumber < 1 || slotNumber > this.maxSlots) {
      console.error(`Попытка назначить некорректный слот ${slotNumber} пользователю ${userId}`);
      return false;
    }
    
    // Проверка занятости слота
    const currentUser = this.slotAssignments.get(slotNumber);
    if (currentUser && currentUser !== userId) {
      console.error(`Слот ${slotNumber} уже занят пользователем ${currentUser}`);
      return false;
    }
    
    // Освобождаем предыдущий слот пользователя, если был
    const previousSlot = this.userSlots.get(userId);
    if (previousSlot !== undefined && previousSlot !== slotNumber) {
      this.slotAssignments.delete(previousSlot);
      console.log(`Освобожден предыдущий слот ${previousSlot} пользователя ${userId}`);
    }
    
    // Назначаем новый слот
    this.slotAssignments.set(slotNumber, userId);
    this.userSlots.set(userId, slotNumber);
    
    console.log(`Назначен слот ${slotNumber} пользователю ${userId}`);
    
    // Отправляем событие об обновлении слотов
    globalEvents.emit("slots_updated", this.getAllSlotAssignments());
    
    return true;
  }
  
  /**
   * Освободить слот пользователя
   * @param userId Идентификатор пользователя
   */
  releaseUserSlot(userId: string): boolean {
    const slotNumber = this.userSlots.get(userId);
    if (slotNumber === undefined) {
      return false;
    }
    
    // Освобождаем слот
    this.slotAssignments.delete(slotNumber);
    this.userSlots.delete(userId);
    
    console.log(`Освобожден слот ${slotNumber} пользователя ${userId}`);
    
    // Отправляем событие об обновлении слотов
    globalEvents.emit("slots_updated", this.getAllSlotAssignments());
    
    return true;
  }
  
  /**
   * Найти и назначить первый свободный слот для пользователя
   * @param userId Идентификатор пользователя
   * @returns Номер назначенного слота или undefined, если свободных слотов нет
   */
  assignFirstAvailableSlot(userId: string): number | undefined {
    // Если у пользователя уже есть слот, возвращаем его
    const existingSlot = this.userSlots.get(userId);
    if (existingSlot !== undefined) {
      return existingSlot;
    }
    
    // Ищем первый свободный слот
    for (let i = 1; i <= this.maxSlots; i++) {
      if (!this.slotAssignments.has(i)) {
        this.assignSlot(userId, i);
        return i;
      }
    }
    
    // Свободных слотов нет
    console.warn(`Не удалось найти свободный слот для ${userId}`);
    return undefined;
  }
  
  /**
   * Проверить и исправить целостность данных в слотах
   */
  private validateIntegrity(): void {
    let needsUpdate = false;
    
    // Проверяем соответствие записей в обоих направлениях
    this.slotAssignments.forEach((userId, slotNumber) => {
      const assignedSlot = this.userSlots.get(userId);
      if (assignedSlot !== slotNumber) {
        console.warn(`Несоответствие слотов: пользователь ${userId} имеет слот ${assignedSlot}, но назначен на ${slotNumber}`);
        this.userSlots.set(userId, slotNumber);
        needsUpdate = true;
      }
    });
    
    this.userSlots.forEach((slotNumber, userId) => {
      const assignedUser = this.slotAssignments.get(slotNumber);
      if (assignedUser !== userId) {
        console.warn(`Несоответствие пользователей: слот ${slotNumber} назначен ${assignedUser}, но занят ${userId}`);
        this.slotAssignments.set(slotNumber, userId);
        needsUpdate = true;
      }
    });
    
    // Если были исправления, отправляем обновление
    if (needsUpdate) {
      globalEvents.emit("slots_updated", this.getAllSlotAssignments());
    }
  }
  
  /**
   * Получить количество занятых слотов
   */
  getOccupiedSlotsCount(): number {
    return this.slotAssignments.size;
  }
  
  /**
   * Получить текущую карту слотов
   */
  getSlotAssignments(): Map<number, string> {
    return new Map(Array.from(this.slotAssignments.entries()));
  }
  
  /**
   * Получить текущую карту пользователей-слотов
   */
  getUserSlots(): Map<string, number> {
    return new Map(Array.from(this.userSlots.entries()));
  }
  
  /**
   * Вывести текущие назначения слотов (для отладки)
   */
  logCurrentAssignments(): void {
    console.log('Текущие назначения слотов:');
    this.slotAssignments.forEach((userId, slot) => {
      console.log(`- Слот ${slot}: ${userId}`);
    });
  }
}

// Создаем глобальный экземпляр менеджера слотов
export const slotManager = new SlotManager();