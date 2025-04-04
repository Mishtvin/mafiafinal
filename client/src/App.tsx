import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import VideoConference from "@/pages/VideoConference";
import DirectConnection from "@/pages/DirectConnection";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/conference" component={VideoConference} />
      <Route path="/direct" component={DirectConnection} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Home() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
      <div className="text-center p-8 max-w-md">
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          MafiaLive - Тестирование
        </h1>
        <div className="flex flex-col space-y-4">
          <Link href="/conference">
            <div className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors block cursor-pointer">
              Стандартная конференция
            </div>
          </Link>
          <Link href="/direct">
            <div className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors block cursor-pointer">
              Прямое подключение с токеном
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
