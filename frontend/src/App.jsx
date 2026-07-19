import { QueryClientProvider } from '@tanstack/react-query';
import AppRouter from './app/AppRouter';
import { queryClient } from './api/queryClient';
import { ColorVisionProvider } from './context/ColorVisionContext';
import './App.css';

export default function App() {
  return (
    <ColorVisionProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>
    </ColorVisionProvider>
  );
}
