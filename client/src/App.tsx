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
      <Route component={NotFound} />
    </Switch>
  );
}

function Home() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
      <div className="text-center p-8 max-w-md">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          MafiaLive
        </h1>
        <p className="text-gray-400 mb-6">
          Видеоконференции с функцией шифрования
        </p>
        
        <div className="mb-8 bg-slate-800/50 p-5 rounded-lg border border-slate-700">
          <h2 className="text-xl font-medium mb-3">Особенности приложения</h2>
          <ul className="text-left text-sm space-y-2">
            <li className="flex items-start">
              <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>End-to-End шифрование для приватности</span>
            </li>
            <li className="flex items-start">
              <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Высококачественное видео с адаптивным битрейтом</span>
            </li>
            <li className="flex items-start">
              <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Оптимизировано для игры "Мафия" и совместных активностей</span>
            </li>
          </ul>
        </div>
        
        <div className="flex flex-col space-y-4">
          <Link href="/conference">
            <div className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors block cursor-pointer">
              <div className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Начать видеоконференцию</span>
              </div>
            </div>
          </Link>
        </div>
        
        <div className="mt-10 text-sm text-gray-500">
          На основе LiveKit и React
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
