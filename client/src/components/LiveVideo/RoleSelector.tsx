import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, UserCog } from 'lucide-react';

interface RoleSelectorProps {
  onRoleSelect: (role: 'player' | 'host') => void;
  isLoading?: boolean;
  hostAvailable?: boolean;
}

/**
 * Компонент для выбора роли при подключении к конференции
 */
export function RoleSelector({ onRoleSelect, isLoading = false, hostAvailable = true }: RoleSelectorProps) {
  const [selectedRole, setSelectedRole] = useState<'player' | 'host' | null>(null);
  
  // Обработчик выбора роли
  const handleRoleSelect = (role: 'player' | 'host') => {
    setSelectedRole(role);
  };
  
  // Подтверждение выбора роли
  const handleConfirm = () => {
    if (selectedRole) {
      onRoleSelect(selectedRole);
    }
  };
  
  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Выберите роль</CardTitle>
          <CardDescription>
            Выберите роль для участия в конференции
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div 
            className={`border rounded-lg p-4 cursor-pointer flex items-center gap-3 hover:bg-muted transition-colors
                      ${selectedRole === 'player' ? 'border-primary bg-primary/10' : 'border-border'}`}
            onClick={() => handleRoleSelect('player')}
          >
            <div className="bg-primary/20 p-2 rounded-full">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Игрок</h3>
              <p className="text-sm text-muted-foreground">Присоединиться как обычный участник</p>
            </div>
          </div>
          
          <div 
            className={`border rounded-lg p-4 cursor-pointer flex items-center gap-3 hover:bg-muted transition-colors
                      ${!hostAvailable ? 'opacity-50 cursor-not-allowed' : ''}
                      ${selectedRole === 'host' ? 'border-primary bg-primary/10' : 'border-border'}`}
            onClick={() => hostAvailable && handleRoleSelect('host')}
          >
            <div className="bg-primary/20 p-2 rounded-full">
              <UserCog className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Ведущий</h3>
              <p className="text-sm text-muted-foreground">
                {hostAvailable 
                  ? 'Присоединиться как ведущий игры'
                  : 'Роль ведущего уже занята'}
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            className="w-full" 
            onClick={handleConfirm} 
            disabled={!selectedRole || isLoading}
          >
            {isLoading ? 'Подключение...' : 'Продолжить'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}