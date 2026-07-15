import { QueryClientProvider } from '@tanstack/react-query';
import AppRouter from './app/AppRouter';
import { queryClient } from './api/queryClient';
import './App.css';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
}
