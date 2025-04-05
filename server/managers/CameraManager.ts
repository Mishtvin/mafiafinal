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

  // Оптимизация: добавляем защиту от слишком частых обновлений
  private lastCameraUpdates = new Map<string, number>();
  private readonly updateThreshold = 500; // ms
  
  /**
   * Установить состояние камеры пользователя с защитой от слишком частых обновлений
   * @param userId Идентификатор пользователя
   * @param isEnabled Новое состояние камеры
   * @returns Объект с результатом обновления или undefined если обновление не выполнено
   */
  setCameraState(userId: string, isEnabled: boolean): { userId: string, isEnabled: boolean, timestamp: number } | undefined {
    const oldState = this.cameraStates.get(userId);
    const now = Date.now();
    
    // Проверяем, не было ли недавно обновления для этого пользователя
    const lastUpdate = this.lastCameraUpdates.get(userId) || 0;
    
    // Проверка на частоту обновлений
    const isTooFrequent = now - lastUpdate < this.updateThreshold;
    
    // ВАЖНОЕ ИЗМЕНЕНИЕ: Мы всегда обновляем метку времени и возвращаем результат, 
    // даже если состояние не изменилось или запрос слишком частый.
    // Это гарантирует, что клиент получит подтверждение своей попытки изменения состояния,
    // даже если реальное изменение не произошло.
    
    // Если состояние не изменилось или обновление слишком частое,
    // обновляем только метку времени, но не меняем состояние
    if (oldState === isEnabled || isTooFrequent) {
      if (oldState === isEnabled) {
        console.log(`Состояние камеры пользователя ${userId} не изменилось (${isEnabled})`);
      }
      
      if (isTooFrequent) {
        console.log(`Слишком частое обновление камеры для ${userId}, пропускаем (прошло ${now - lastUpdate}ms)`);
      }
      
      // Обновляем метку времени в любом случае
      this.lastCameraUpdates.set(userId, now);
      
      // Возвращаем текущее состояние с пометкой, что изменений не было
      return {
        userId,
        isEnabled: oldState !== undefined ? oldState : isEnabled, // Используем текущее состояние или новое, если текущего нет
        timestamp: now,
        // Новое поле, показывающее, что состояние не изменилось
        noChange: true
      } as any; // Используем any для совместимости с существующим интерфейсом
    }
    
    // Обновляем состояние и время последнего обновления
    this.cameraStates.set(userId, isEnabled);
    this.lastCameraUpdates.set(userId, now);
    
    console.log(`Камера пользователя ${userId} ${isEnabled ? 'включена' : 'выключена'}`);
    
    // Логируем состояние для отладки
    console.log('Текущие состояния камер:', JSON.stringify(this.getAllCameraStates()));
    
    // Возвращаем результат обновления
    return {
      userId,
      isEnabled,
      timestamp: now
    };
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
      this.lastCameraUpdates.delete(userId); // Очищаем историю обновлений
      console.log(`Удалена информация о камере пользователя ${userId}`);
      
      // Отправляем событие об изменении состояния только для этого пользователя
      // Устанавливаем false, так как камера больше не используется
      // Используем новый подход с индивидуальными обновлениями с задержкой
      // чтобы избежать состояния гонки с другими обновлениями
      setTimeout(() => {
        globalEvents.emit("camera_state_changed", userId, false);
      }, 200);
      
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
      
      // Устанавливаем метку времени начальной инициализации
      this.lastCameraUpdates.set(userId, Date.now());
      
      console.log(`Инициализировано состояние камеры для нового пользователя ${userId} (выключена)`);
      
      // При инициализации НЕ отправляем уведомление о состоянии камеры всем клиентам
      // Только сохраняем локальное значение. Обновления для других клиентов будут 
      // отправлены в registerConnection, когда всем клиентам отправляются текущие состояния
      
      // Логируем состояние для отладки
      console.log('Текущие состояния камер после инициализации:', JSON.stringify(this.getAllCameraStates()));
    }
  }
}

// Создаем глобальный экземпляр менеджера камер
export const cameraManager = new CameraManager();