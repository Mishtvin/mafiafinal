import { SlotInfo } from '@shared/schema';
import { globalEvents } from './EventEmitter';

// Константы для слотов
const HOST_SLOT = 12;
const HOST_PREFIX = 'Host-';
const PLAYER_PREFIX = 'Player-';

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
   * Проверить, является ли пользователь ведущим
   * @param userId ID пользователя
   * @returns true, если пользователь - ведущий
   */
  isUserHost(userId: string): boolean {
    return userId.startsWith(HOST_PREFIX);
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
    
    // Проверяем особые правила для слота ведущего
    if (slotNumber === HOST_SLOT && !this.isUserHost(userId)) {
      console.error(`Слот ${HOST_SLOT} зарезервирован только для ведущего`);
      return false;
    }
    
    // Проверяем ограничение: ведущий не может уйти с 12 слота
    const previousSlot = this.userSlots.get(userId);
    if (this.isUserHost(userId) && previousSlot === HOST_SLOT && slotNumber !== HOST_SLOT) {
      console.error(`Ведущий ${userId} не может покинуть слот ${HOST_SLOT}`);
      return false;
    }
    
    // Проверка занятости слота
    const currentUser = this.slotAssignments.get(slotNumber);
    if (currentUser && currentUser !== userId) {
      console.error(`Слот ${slotNumber} уже занят пользователем ${currentUser}`);
      return false;
    }
    
    // Освобождаем предыдущий слот пользователя, если был
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
    
    // Проверяем, что слот действительно занят этим пользователем
    const currentUserInSlot = this.slotAssignments.get(slotNumber);
    if (currentUserInSlot !== userId) {
      console.log(`Попытка освободить слот ${slotNumber}, но он занят другим пользователем: ${currentUserInSlot}`);
      return false;
    }
    
    // Запрещаем ведущему освобождать свой слот 12
    if (this.isUserHost(userId) && slotNumber === HOST_SLOT) {
      console.error(`Ведущий ${userId} не может освободить слот ${HOST_SLOT}`);
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
    
    // Проверяем роль пользователя
    const isHost = this.isUserHost(userId);
    
    if (isHost) {
      // Ведущему назначаем специальный слот 12
      console.log(`Автоматическое назначение слота для ведущего: ${userId}`);
      
      // Если слот 12 занят, освобождаем его
      const currentHostUser = this.slotAssignments.get(HOST_SLOT);
      if (currentHostUser) {
        console.log(`Слот ведущего ${HOST_SLOT} уже занят пользователем ${currentHostUser}, освобождаем`);
        this.releaseUserSlot(currentHostUser);
      }
      
      // Назначаем слот ведущего
      this.assignSlot(userId, HOST_SLOT);
      return HOST_SLOT;
    } else {
      // Игроку ищем первый свободный слот (кроме слота ведущего)
      console.log(`Занятые слоты перед назначением для ${userId}: [${Array.from(this.slotAssignments.keys())}]`);
      
      // Ищем свободные слоты для обычных игроков (1-11)
      for (let i = 1; i < HOST_SLOT; i++) {
        if (!this.slotAssignments.has(i)) {
          console.log(`Автоматически назначен слот ${i} для ${userId}`);
          this.assignSlot(userId, i);
          return i;
        }
      }
      
      // Свободных слотов нет
      console.warn(`Не удалось найти свободный слот для ${userId}`);
      return undefined;
    }
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
  
  /**
   * Освободить конкретный слот (если он занят)
   * @param slotNumber Номер слота для освобождения
   * @returns true, если слот был освобожден
   */
  private releaseSlot(slotNumber: number): boolean {
    const userId = this.slotAssignments.get(slotNumber);
    if (!userId) {
      return false; // Слот и так свободен
    }
    
    // Запрещаем освобождать слот ведущего (12)
    if (slotNumber === HOST_SLOT && this.isUserHost(userId)) {
      console.error(`Нельзя освободить слот ведущего ${HOST_SLOT} для ${userId}`);
      return false;
    }
    
    // Удаляем слот из обеих карт
    this.slotAssignments.delete(slotNumber);
    this.userSlots.delete(userId);
    
    console.log(`Освобожден слот ${slotNumber}, ранее занимаемый пользователем ${userId}`);
    return true;
  }
  
  /**
   * Переместить пользователя из одного слота в другой (для ведущего)
   * @param hostId ID ведущего, который выполняет перемещение
   * @param userIdToMove ID пользователя, которого нужно переместить
   * @param targetSlot Целевой слот для перемещения
   * @returns true, если перемещение успешно выполнено
   */
  moveUserToSlot(hostId: string, userIdToMove: string, targetSlot: number): boolean {
    // Проверяем, является ли исполнитель ведущим
    if (!this.isUserHost(hostId)) {
      console.log(`Отказано в перемещении: ${hostId} не является ведущим`);
      return false;
    }
    
    // Проверяем валидность целевого слота
    if (targetSlot < 1 || targetSlot > this.maxSlots) {
      console.log(`Недопустимый номер слота: ${targetSlot}`);
      return false;
    }
    
    // Если пытаемся переместить ведущего или целевой слот - слот ведущего, запрещаем это
    if (this.isUserHost(userIdToMove) || targetSlot === HOST_SLOT) {
      console.log(`Нельзя переместить ведущего из слота ${HOST_SLOT} или назначить кого-либо на слот ведущего`);
      return false;
    }
    
    // Проверяем, что пользователь существует и имеет назначенный слот
    const currentSlot = this.userSlots.get(userIdToMove);
    if (currentSlot === undefined) {
      console.log(`Пользователь ${userIdToMove} не имеет назначенного слота`);
      return false;
    }
    
    // Проверка на слот ведущего уже выполнена выше
    
    // Проверяем, не занят ли целевой слот другим пользователем
    const currentOccupant = this.slotAssignments.get(targetSlot);
    if (currentOccupant && currentOccupant !== userIdToMove) {
      // Слот занят другим пользователем, освобождаем его
      this.releaseSlot(targetSlot);
    }
    
    // Освобождаем текущий слот пользователя
    this.releaseSlot(currentSlot);
    
    // Назначаем новый слот
    this.slotAssignments.set(targetSlot, userIdToMove);
    this.userSlots.set(userIdToMove, targetSlot);
    
    console.log(`Ведущий ${hostId} переместил пользователя ${userIdToMove} из слота ${currentSlot} в слот ${targetSlot}`);
    
    // Проверяем целостность для уверенности
    this.validateIntegrity();
    
    // Отправляем событие об изменении слотов
    globalEvents.emit("slots_updated", this.getAllSlotAssignments());
    
    return true;
  }
}

// Создаем глобальный экземпляр менеджера слотов
export const slotManager = new SlotManager();