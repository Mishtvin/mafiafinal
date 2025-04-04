interface ConnectionIndicatorProps {
  connectionState: string;
}

export default function ConnectionIndicator({ connectionState }: ConnectionIndicatorProps) {
  let color = 'bg-yellow-500';
  let text = 'Connecting';
  
  switch (connectionState) {
    case 'connected':
      color = 'bg-green-500';
      text = 'Connected';
      break;
    case 'connecting':
      color = 'bg-yellow-500';
      text = 'Connecting';
      break;
    case 'reconnecting':
      color = 'bg-orange-500';
      text = 'Reconnecting';
      break;
    case 'disconnected':
      color = 'bg-red-500';
      text = 'Disconnected';
      break;
    default:
      color = 'bg-gray-500';
      text = 'Unknown';
  }

  return (
    <div className="flex items-center space-x-2 text-sm">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`}></span>
      <span>{text}</span>
    </div>
  );
}
