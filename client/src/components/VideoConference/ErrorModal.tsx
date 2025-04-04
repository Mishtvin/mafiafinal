import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ErrorModalProps {
  isOpen: boolean;
  error: Error | null;
  onDismiss: () => void;
  onRetry: () => void;
}

export default function ErrorModal({ isOpen, error, onDismiss, onRetry }: ErrorModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-500 flex items-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="mr-2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Ошибка подключения
          </DialogTitle>
          <DialogDescription className="text-sm mt-2">
            Не удалось подключиться к конференции. Пожалуйста, проверьте ваше интернет-соединение и попробуйте снова.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-red-50 p-3 rounded-md border border-red-200 text-red-700 text-sm my-2">
          <div className="font-medium mb-1">Детали ошибки:</div>
          <div className="font-mono text-xs p-2 bg-red-100 rounded">
            {error?.message || 'Неизвестная ошибка'}
          </div>
          {error?.name === 'ServerUnreachable' && (
            <div className="mt-2 text-xs">
              <p className="font-semibold">Возможная причина:</p>
              <ul className="list-disc list-inside mt-1">
                <li>Сервер LiveKit недоступен</li>
                <li>Неверный URL сервера</li>
                <li>Проблемы с сетевым подключением</li>
              </ul>
            </div>
          )}
        </div>
        
        <DialogFooter className="flex space-x-2 sm:space-x-0 sm:space-y-2">
          <Button 
            variant="outline" 
            onClick={onDismiss}
            className="sm:w-full"
          >
            Закрыть
          </Button>
          <Button 
            onClick={onRetry}
            className="sm:w-full"
          >
            Повторить попытку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}