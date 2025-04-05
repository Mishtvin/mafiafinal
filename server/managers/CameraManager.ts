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
    
    // Отправляем событие об изменении состояния камеры
    globalEvents.emit("camera_state_changed", userId, isEnabled);
    globalEvents.emit("camera_states_updated", this.getAllCameraStates());
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
      this.cameraStates.delete(userId);
      console.log(`Удалена информация о камере пользователя ${userId}`);
      
      // Отправляем событие об обновлении состояний камер
      globalEvents.emit("camera_states_updated", this.getAllCameraStates());
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
      
      // Отправляем обновление только для этого пользователя, не трогая остальных
      // Создаем объект только с обновлением для нового пользователя
      const updateForUser: Record<string, boolean> = {};
      updateForUser[userId] = false;
      
      // Отправляем индивидуальное обновление через событие
      globalEvents.emit("camera_state_changed", userId, false);
      
      // Для поддержки совместимости с существующими подписчиками
      // отправляем полное состояние, но не обновляем всех
      const allStates = this.getAllCameraStates();
      globalEvents.emit("camera_states_updated", allStates);
    }
  }
}

// Создаем глобальный экземпляр менеджера камер
export const cameraManager = new CameraManager();