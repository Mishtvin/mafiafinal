import { globalEvents } from './EventEmitter';

/**
 * Менеджер камер - управляет состоянием камер пользователей
 */
export class CameraManager {
  // Хранилище состояний камер пользователей (userId -> состояние камеры)
  private cameraStates = new Map<string, boolean>();

  constructor() {
    console.log('CameraManager: Инициализирован');
  }

  /**
   * Получить все текущие состояния камер
   */
  getAllCameraStates(): Record<string, boolean> {
    const states: Record<string, boolean> = {};
    this.cameraStates.forEach((isEnabled, userId) => {
      states[userId] = isEnabled;
    });
    return states;
  }

  /**
   * Получить состояние камеры пользователя
   * @param userId Идентификатор пользователя
   * @returns Статус камеры или undefined, если статус не найден
   */
  getCameraState(userId: string): boolean | undefined {
    return this.cameraStates.get(userId);
  }

  /**
   * Установить состояние камеры пользователя
   * @param userId Идентификатор пользователя
   * @param isEnabled Новое состояние камеры
   */
  setCameraState(userId: string, isEnabled: boolean): void {
    const oldState = this.cameraStates.get(userId);
    
    // Если состояние не изменилось, ничего не делаем
    if (oldState === isEnabled) {
      return;
    }
    
    this.cameraStates.set(userId, isEnabled);
    console.log(`Камера пользователя ${userId} ${isEnabled ? 'включена' : 'выключена'}`);
    
    // Отправляем ТОЛЬКО событие об индивидуальном изменении состояния камеры
    // и НЕ отправляем массовое обновление, которое может сбросить состояния других камер
    globalEvents.emit("camera_state_changed", userId, isEnabled);
    
    // Логируем состояние для отладки
    console.log('Текущие состояния камер:', JSON.stringify(this.getAllCameraStates()));
  }

  /**
   * Выключить камеру пользователя (используется при неактивности)
   * @param userId Идентификатор пользователя
   */
  disableCamera(userId: string): void {
    if (this.cameraStates.get(userId) === true) {
      this.setCameraState(userId, false);
      console.log(`Камера пользователя ${userId} автоматически выключена из-за неактивности`);
    }
  }

  /**
   * Удалить информацию о состоянии камеры пользователя
   * @param userId Идентификатор пользователя
   */
  removeCameraState(userId: string): void {
    if (this.cameraStates.has(userId)) {
      const wasEnabled = this.cameraStates.get(userId);
      this.cameraStates.delete(userId);
      console.log(`Удалена информация о камере пользователя ${userId}`);
      
      // Отправляем событие об изменении состояния только для этого пользователя
      // Устанавливаем false, так как камера больше не используется
      globalEvents.emit("camera_state_changed", userId, false);
      
      // Логируем состояние для отладки
      console.log('Текущие состояния камер после удаления:', JSON.stringify(this.getAllCameraStates()));
    }
  }

  /**
   * Инициализировать состояние камеры для нового пользователя
   * @param userId Идентификатор пользователя
   */
  initializeUserCamera(userId: string): void {
    if (!this.cameraStates.has(userId)) {
      // По умолчанию камера выключена
      this.cameraStates.set(userId, false);
      console.log(`Инициализировано состояние камеры для нового пользователя ${userId} (выключена)`);
      
      // Отправляем индивидуальное обновление через событие
      // только для конкретного пользователя
      globalEvents.emit("camera_state_changed", userId, false);
      
      // Логируем состояние для отладки
      console.log('Текущие состояния камер после инициализации:', JSON.stringify(this.getAllCameraStates()));
    }
  }
}

// Создаем глобальный экземпляр менеджера камер
export const cameraManager = new CameraManager();