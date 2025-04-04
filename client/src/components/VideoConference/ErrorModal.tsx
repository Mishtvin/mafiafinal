import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ErrorModalProps {
  isOpen: boolean;
  error: Error | null;
  onDismiss: () => void;
  onRetry: () => void;
}

export default function ErrorModal({ isOpen, error, onDismiss, onRetry }: ErrorModalProps) {
  if (!error) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="bg-slate-800 text-white border-slate-700 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-red-500">Connection Error</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p>{error.message}</p>
          
          <div className="bg-black/30 rounded p-3 text-sm font-mono overflow-auto max-h-32">
            <code>{error.stack || 'No detailed error information available'}</code>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button 
              variant="outline" 
              onClick={onDismiss}
              className="bg-slate-700 hover:bg-slate-600 border-slate-600"
            >
              Dismiss
            </Button>
            <Button 
              onClick={onRetry}
              className="bg-blue-500 hover:bg-blue-600"
            >
              Retry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
